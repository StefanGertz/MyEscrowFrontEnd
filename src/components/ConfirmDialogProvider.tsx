"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type ConfirmOptions = {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => void;
};

const ConfirmDialogContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const confirm = useCallback((options: ConfirmOptions) => {
    setIsConfirming(false);
    setDialog(options);
  }, []);

  const closeDialog = useCallback(() => {
    if (isConfirming) return;
    setDialog(null);
  }, [isConfirming]);

  const handleConfirm = useCallback(async () => {
    if (!dialog?.onConfirm || isConfirming) {
      return;
    }
    setIsConfirming(true);
    try {
      await dialog.onConfirm();
      setDialog(null);
    } finally {
      setIsConfirming(false);
    }
  }, [dialog, isConfirming]);

  return (
    <ConfirmDialogContext.Provider value={{ confirm }}>
      {children}
      {dialog ? (
        <div className="modal-overlay" onClick={closeDialog}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <h3>{dialog.title}</h3>
            <p className="muted">{dialog.body}</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="ghost" onClick={closeDialog} disabled={isConfirming}>
                {dialog.cancelLabel ?? "Cancel"}
              </button>
              <button className="btn" onClick={handleConfirm} disabled={isConfirming}>
                {isConfirming
                  ? `${dialog.confirmLabel ?? "Continue"}…`
                  : dialog.confirmLabel ?? "Continue"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog() {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx) {
    throw new Error("useConfirmDialog must be used within a ConfirmDialogProvider");
  }
  return ctx;
}
