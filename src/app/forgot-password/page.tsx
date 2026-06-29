"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useForgotPasswordMutation } from "@/hooks/useAuthApi";
import { useToast } from "@/components/ToastProvider";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const forgotPassword = useForgotPasswordMutation();
  const { pushToast } = useToast();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!email) {
      setError("Enter your email address.");
      return;
    }
    try {
      const result = await forgotPassword.mutateAsync({ email });
      pushToast({
        variant: "info",
        title: "Password reset email sent",
        body: "If that account exists, check your inbox for a six-digit code.",
      });
      const params = new URLSearchParams({ email: result.email });
      if (result.debugCode) {
        params.set("debugCode", result.debugCode);
      }
      if (result.expiresAt) {
        params.set("expiresAt", result.expiresAt);
      }
      router.push(`/reset-password?${params.toString()}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to send reset email.";
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
            Recover access
          </h1>
          <p className="lead">
            Enter your account email and we&apos;ll send a six-digit reset code.
          </p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="muted" htmlFor="forgot-email">
            Email
          </label>
          <input
            id="forgot-email"
            type="email"
            value={email}
            placeholder="you@example.com"
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
          {error ? (
            <div className="auth-error" role="alert">
              {error}
            </div>
          ) : null}
          <button className="btn" type="submit" disabled={forgotPassword.isPending}>
            {forgotPassword.isPending ? "Sending..." : "Send reset code"}
          </button>
          <div className="auth-footer">
            Remembered it? <Link href="/login">Back to sign in</Link>
          </div>
        </form>
      </div>
    </main>
  );
}
