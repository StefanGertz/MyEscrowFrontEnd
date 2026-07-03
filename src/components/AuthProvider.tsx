"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type AuthResponse,
  type AuthUser,
  useLoginMutation,
  useSignupMutation,
} from "@/hooks/useAuthApi";
import { setClientAuthToken } from "@/lib/apiClient";
import { isSessionExpired, resolveSessionExpiresAt } from "@/lib/sessionExpiry";

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isHydrating: boolean;
  isAuthenticated: boolean;
  login: (payload: { email: string; password: string }) => Promise<void>;
  signup: (
    payload: { name: string; email: string; password: string },
  ) => Promise<SignupResult>;
  logout: () => void;
  completeAuth: (response: AuthResponse) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "myescrow.auth";

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  expiresAt: string | null;
};

const emptyAuthState = (): AuthState => ({ user: null, token: null, expiresAt: null });

const readStorage = (): AuthState => {
  if (typeof window === "undefined") {
    return emptyAuthState();
  }
  try {
    // Durable browser sessions are intentionally unsupported. Session storage
    // survives refreshes but is cleared when the tab/browser session closes.
    window.localStorage.removeItem(STORAGE_KEY);
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyAuthState();
    }
    const parsed = JSON.parse(raw) as { user?: AuthUser; token?: string; expiresAt?: string };
    if (!parsed.user || !parsed.token) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return emptyAuthState();
    }
    const expiresAt = resolveSessionExpiresAt(parsed.expiresAt);
    if (isSessionExpired(expiresAt)) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return emptyAuthState();
    }
    return {
      user: parsed.user,
      token: parsed.token,
      expiresAt,
    };
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
    return emptyAuthState();
  }
};

const writeStorage = (value: AuthState) => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  if (!value.user || !value.token || !value.expiresAt) {
    window.sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ user: value.user, token: value.token, expiresAt: value.expiresAt }),
  );
};

type AuthProviderProps = {
  children: ReactNode;
};

type SignupResult =
  | { status: "session"; user: AuthUser }
  | { status: "verification"; email: string; expiresAt?: string; debugCode?: string };

export function AuthProvider({ children }: AuthProviderProps) {
  const loginMutation = useLoginMutation();
  const signupMutation = useSignupMutation();
  const [state, setState] = useState<AuthState>(emptyAuthState);
  const [isHydrating, setIsHydrating] = useState(true);

  const clearSession = useCallback(() => {
    setState(emptyAuthState());
    setClientAuthToken(null);
    writeStorage(emptyAuthState());
  }, []);

  useEffect(() => {
    const restored = readStorage();
    startTransition(() => {
      setState(restored);
      setClientAuthToken(restored.token);
      writeStorage(restored);
      setIsHydrating(false);
    });
  }, []);

  useEffect(() => {
    if (!state.token || !state.expiresAt) return;

    const remainingMs = Date.parse(state.expiresAt) - Date.now();
    const timeoutId = window.setTimeout(clearSession, Math.max(0, remainingMs));
    return () => window.clearTimeout(timeoutId);
  }, [clearSession, state.expiresAt, state.token]);

  const adoptSession = useCallback((response: AuthResponse) => {
      const nextState: AuthState = {
        user: response.user,
        token: response.token,
        expiresAt: resolveSessionExpiresAt(response.expiresAt),
      };
      setState(nextState);
      setClientAuthToken(response.token);
      writeStorage(nextState);
  }, []);

  const login = useCallback(
    async (payload: { email: string; password: string }) => {
      const response = await loginMutation.mutateAsync(payload);
      adoptSession(response);
    },
    [loginMutation, adoptSession],
  );

  const signup = useCallback(
    async (payload: { name: string; email: string; password: string }) => {
      const response = await signupMutation.mutateAsync(payload);
      if ("token" in response) {
        adoptSession(response);
        return { status: "session", user: response.user } satisfies SignupResult;
      }
      return {
        status: "verification",
        email: response.email,
        expiresAt: response.expiresAt,
        debugCode: response.debugCode,
      } satisfies SignupResult;
    },
    [signupMutation, adoptSession],
  );

  const logout = clearSession;

  const value = useMemo<AuthContextValue>(() => {
    return {
      user: state.user,
      token: state.token,
      isHydrating,
      isAuthenticated: Boolean(state.user && state.token),
      login,
      signup,
      logout,
      completeAuth: adoptSession,
    };
  }, [state, isHydrating, login, signup, logout, adoptSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
