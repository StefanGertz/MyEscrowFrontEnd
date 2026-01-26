"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastVariant = "success" | "error" | "info";

type ToastEntry = {
  id: string;
  title: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  pushToast: (toast: Omit<ToastEntry, "id">) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const randomId = () => Math.random().toString(36).slice(2, 9);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    return () => {
      timeouts.current.forEach((timeoutId) => clearTimeout(timeoutId));
      timeouts.current.clear();
    };
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timeoutId = timeouts.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeouts.current.delete(id);
    }
  }, []);

  const pushToast = useCallback(
    ({ title, variant }: Omit<ToastEntry, "id">) => {
      const id = randomId();
      setToasts((prev) => [...prev, { id, title, variant }]);
      const timeoutId = setTimeout(() => dismissToast(id), 5000);
      timeouts.current.set(id, timeoutId);
    },
    [dismissToast],
  );

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast--${toast.variant}`}
            onClick={() => dismissToast(toast.id)}
            tabIndex={0}
            role="alert"
          >
            {toast.title}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
