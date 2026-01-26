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
  type AuthUser,
  useLoginMutation,
  useSignupMutation,
} from "@/hooks/useAuthApi";
import { setClientAuthToken } from "@/lib/apiClient";

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isHydrating: boolean;
  isAuthenticated: boolean;
  login: (payload: { email: string; password: string }) => Promise<void>;
  signup: (payload: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "myescrow.auth";

const readStorage = (): { user: AuthUser | null; token: string | null } => {
  if (typeof window === "undefined") {
    return { user: null, token: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { user: null, token: null };
    }
    const parsed = JSON.parse(raw) as { user: AuthUser; token: string };
    return {
      user: parsed.user ?? null,
      token: parsed.token ?? null,
    };
  } catch {
    return { user: null, token: null };
  }
};

const writeStorage = (value: { user: AuthUser | null; token: string | null }) => {
  if (typeof window === "undefined") return;
  if (!value.user || !value.token) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ user: value.user, token: value.token }),
  );
};

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const loginMutation = useLoginMutation();
  const signupMutation = useSignupMutation();
  const [state, setState] = useState<{ user: AuthUser | null; token: string | null }>({
    user: null,
    token: null,
  });
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    const restored = readStorage();
    startTransition(() => {
      setState(restored);
      if (restored.token) {
        setClientAuthToken(restored.token);
      }
      setIsHydrating(false);
    });
  }, []);

  const login = useCallback(
    async (payload: { email: string; password: string }) => {
      const response = await loginMutation.mutateAsync(payload);
      setState({ user: response.user, token: response.token });
      setClientAuthToken(response.token);
      writeStorage({ user: response.user, token: response.token });
    },
    [loginMutation],
  );

  const signup = useCallback(
    async (payload: { name: string; email: string; password: string }) => {
      const response = await signupMutation.mutateAsync(payload);
      setState({ user: response.user, token: response.token });
      setClientAuthToken(response.token);
      writeStorage({ user: response.user, token: response.token });
    },
    [signupMutation],
  );

  const logout = useCallback(() => {
    setState({ user: null, token: null });
    setClientAuthToken(null);
    writeStorage({ user: null, token: null });
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    return {
      user: state.user,
      token: state.token,
      isHydrating,
      isAuthenticated: Boolean(state.user && state.token),
      login,
      signup,
      logout,
    };
  }, [state, isHydrating, login, signup, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
