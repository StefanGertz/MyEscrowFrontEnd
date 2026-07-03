"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useChangePasswordMutation } from "@/hooks/useAuthApi";
import { useToast } from "@/components/ToastProvider";

type ChangePasswordModalProps = {
  onClose: () => void;
};

export function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
  const changePassword = useChangePasswordMutation();
  const { pushToast } = useToast();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [error, setError] = useState<string | null>(null);

  const passwordChecks = useMemo(() => {
    const value = form.newPassword;
    return [
      { label: "12+ characters", valid: value.length >= 12 },
      { label: "At least one uppercase letter", valid: /[A-Z]/.test(value) },
      { label: "At least one lowercase letter", valid: /[a-z]/.test(value) },
      { label: "At least one number", valid: /[0-9]/.test(value) },
      { label: "At least one symbol", valid: /[^A-Za-z0-9]/.test(value) },
    ];
  }, [form.newPassword]);
  const isPasswordStrong = passwordChecks.every((check) => check.valid);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      setError("Complete all password fields.");
      return;
    }
    if (!isPasswordStrong) {
      setError("Use a stronger password that meets all requirements.");
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (form.currentPassword === form.newPassword) {
      setError("New password must be different from your current password.");
      return;
    }
    try {
      await changePassword.mutateAsync({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      pushToast({
        variant: "success",
        title: "Password updated",
        body: "Use your new password the next time you sign in.",
      });
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to change password.";
      setError(message);
      pushToast({ variant: "error", title: message });
    }
  };

  return (
    <div className="modal-overlay" onClick={changePassword.isPending ? undefined : onClose}>
      <div
        className="modal-content change-password-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="change-password-title">Change password</h3>
        <p className="muted">Confirm your current password, then choose a new one.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="muted" htmlFor="current-password">Current password</label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={form.currentPassword}
            onChange={(event) => setForm((current) => ({ ...current, currentPassword: event.target.value }))}
          />
          <label className="muted" htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={form.newPassword}
            onChange={(event) => setForm((current) => ({ ...current, newPassword: event.target.value }))}
          />
          <ul className="password-requirements" aria-label="Password requirements">
            {passwordChecks.map((check) => (
              <li key={check.label} className={check.valid ? "valid" : "invalid"}>
                <span aria-hidden="true">{check.valid ? "✓" : "○"}</span>
                {check.label}
              </li>
            ))}
          </ul>
          <label className="muted" htmlFor="confirm-new-password">Confirm new password</label>
          <input
            id="confirm-new-password"
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
          />
          {error ? <div className="auth-error" role="alert">{error}</div> : null}
          <div className="change-password-actions">
            <button type="button" className="ghost" onClick={onClose} disabled={changePassword.isPending}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={changePassword.isPending}>
              {changePassword.isPending ? "Updating..." : "Update password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
