"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  useResendVerificationMutation,
  useVerifyEmailMutation,
} from "@/hooks/useAuthApi";
import { useToast } from "@/components/ToastProvider";

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get("email") ?? "";
  const presetCode = searchParams.get("debugCode") ?? "";
  const expiresAt = searchParams.get("expiresAt");
  const { completeAuth, isAuthenticated, isHydrating } = useAuth();
  const { pushToast } = useToast();
  const verifyMutation = useVerifyEmailMutation();
  const resendMutation = useResendVerificationMutation();
  const [form, setForm] = useState({ email: initialEmail, code: presetCode });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isHydrating && isAuthenticated) {
      router.replace("/");
    }
  }, [isHydrating, isAuthenticated, router]);

  const formattedExpiry = useMemo(() => {
    if (!expiresAt) return null;
    const date = new Date(expiresAt);
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }, [expiresAt]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!form.email || !form.code) {
      setError("Enter the email address you signed up with and the 6-digit code.");
      return;
    }
    try {
      const response = await verifyMutation.mutateAsync({
        email: form.email,
        code: form.code.trim(),
      });
      completeAuth(response);
      pushToast({ variant: "success", title: "Email verified. Welcome back!" });
      router.replace("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Verification failed.";
      setError(message);
      pushToast({ variant: "error", title: message });
    }
  };

  const handleResend = async () => {
    setError(null);
    try {
      const result = await resendMutation.mutateAsync({ email: form.email });
      pushToast({
        variant: "info",
        title: "Verification email sent",
        body: "Check your inbox for a new code.",
      });
      if (result.debugCode) {
        setForm((prev) => ({ ...prev, code: result.debugCode ?? prev.code }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to resend email.";
      setError(message);
      pushToast({ variant: "error", title: message });
    }
  };

  if (isAuthenticated) {
    return null;
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div>
          <p className="auth-eyebrow">Verify email</p>
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            Secure your account
          </h1>
          <p className="lead">
            Enter the 6-digit code we sent to{" "}
            <strong>{form.email || "your inbox"}</strong>.
            {formattedExpiry ? ` Code expires around ${formattedExpiry}.` : null}
          </p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="muted" htmlFor="verify-email">
            Email
          </label>
          <input
            id="verify-email"
            type="email"
            value={form.email}
            placeholder="you@example.com"
            onChange={(event) =>
              setForm((prev) => ({ ...prev, email: event.target.value }))
            }
            autoComplete="email"
          />
          <label className="muted" htmlFor="verify-code">
            Verification code
          </label>
          <input
            id="verify-code"
            type="text"
            inputMode="numeric"
            value={form.code}
            placeholder="123456"
            onChange={(event) =>
              setForm((prev) => ({ ...prev, code: event.target.value }))
            }
          />
          {error ? (
            <div className="auth-error" role="alert">
              {error}
            </div>
          ) : null}
          <button className="btn" type="submit" disabled={verifyMutation.isPending}>
            {verifyMutation.isPending ? "Verifying..." : "Verify email"}
          </button>
          <div className="auth-footer" style={{ flexDirection: "column", gap: 8 }}>
            <button
              type="button"
              className="ghost"
              onClick={handleResend}
              disabled={resendMutation.isPending || !form.email}
            >
              {resendMutation.isPending ? "Sending..." : "Resend code"}
            </button>
            <span>
              Entered the wrong email? <Link href="/signup">Start over</Link>
            </span>
          </div>
        </form>
      </div>
    </main>
  );
}
