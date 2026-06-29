"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { useResetPasswordMutation } from "@/hooks/useAuthApi";
import { useToast } from "@/components/ToastProvider";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordFallback() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="auth-eyebrow">Reset password</p>
        <p className="lead">Loading password reset screen...</p>
      </div>
    </main>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetPassword = useResetPasswordMutation();
  const { pushToast } = useToast();
  const [form, setForm] = useState({
    email: searchParams.get("email") ?? "",
    code: searchParams.get("debugCode") ?? "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  const expiresAt = searchParams.get("expiresAt");

  const passwordChecks = useMemo(() => {
    const value = form.password;
    return [
      { label: "12+ characters", valid: value.length >= 12 },
      { label: "At least one uppercase letter", valid: /[A-Z]/.test(value) },
      { label: "At least one lowercase letter", valid: /[a-z]/.test(value) },
      { label: "At least one number", valid: /[0-9]/.test(value) },
      { label: "At least one symbol", valid: /[^A-Za-z0-9]/.test(value) },
    ];
  }, [form.password]);
  const isPasswordStrong = passwordChecks.every((check) => check.valid);
  const formattedExpiry = useMemo(() => {
    if (!expiresAt) return null;
    return new Date(expiresAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }, [expiresAt]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!form.email || !form.code || !form.password) {
      setError("Enter your email, reset code, and new password.");
      return;
    }
    if (!isPasswordStrong) {
      setError("Use a stronger password that meets all requirements.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    try {
      await resetPassword.mutateAsync({
        email: form.email,
        code: form.code.trim(),
        password: form.password,
      });
      pushToast({
        variant: "success",
        title: "Password updated",
        body: "Sign in with your new password.",
      });
      router.replace("/login");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to reset password.";
      setError(message);
      pushToast({ variant: "error", title: message });
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div>
          <p className="auth-eyebrow">Reset password</p>
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            Set a new password
          </h1>
          <p className="lead">
            Enter the six-digit code from your inbox.
            {formattedExpiry ? ` Code expires around ${formattedExpiry}.` : null}
          </p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="muted" htmlFor="reset-email">
            Email
          </label>
          <input
            id="reset-email"
            type="email"
            value={form.email}
            placeholder="you@example.com"
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            autoComplete="email"
          />
          <label className="muted" htmlFor="reset-code">
            Reset code
          </label>
          <input
            id="reset-code"
            type="text"
            inputMode="numeric"
            value={form.code}
            placeholder="123456"
            onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
          />
          <label className="muted" htmlFor="reset-password">
            New password
          </label>
          <input
            id="reset-password"
            type="password"
            value={form.password}
            placeholder="Create a new password"
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            autoComplete="new-password"
          />
          <label className="muted" htmlFor="reset-confirm">
            Confirm password
          </label>
          <input
            id="reset-confirm"
            type="password"
            value={form.confirmPassword}
            placeholder="Repeat your new password"
            onChange={(event) =>
              setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
            }
            autoComplete="new-password"
          />
          <ul className="password-requirements">
            {passwordChecks.map((check) => (
              <li key={check.label} className={check.valid ? "valid" : "invalid"}>
                {check.valid ? "[OK]" : "[  ]"} {check.label}
              </li>
            ))}
          </ul>
          {error ? (
            <div className="auth-error" role="alert">
              {error}
            </div>
          ) : null}
          <button className="btn" type="submit" disabled={resetPassword.isPending}>
            {resetPassword.isPending ? "Updating..." : "Reset password"}
          </button>
          <div className="auth-footer">
            Need a new code? <Link href="/forgot-password">Start over</Link>
          </div>
        </form>
      </div>
    </main>
  );
}
