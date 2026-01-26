"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isHydrating } = useAuth();
  const { pushToast } = useToast();
  const [form, setForm] = useState({ email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isHydrating && isAuthenticated) {
      router.replace("/");
    }
  }, [isHydrating, isAuthenticated, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!form.email || !form.password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      await login({ email: form.email, password: form.password });
      pushToast({
        variant: "success",
        title: "Welcome back! Redirecting to your dashboard.",
      });
      router.replace("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign in.";
      setError(message);
      pushToast({ variant: "error", title: message });
    } finally {
      setSubmitting(false);
    }
  };

  if (isAuthenticated) {
    return null;
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div>
          <p className="auth-eyebrow">Sign in</p>
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            Access MyEscrow
          </h1>
          <p className="lead">
            Track milestones, funding, and alerts from one secure console.
          </p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="muted" htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            value={form.email}
            placeholder="you@example.com"
            onChange={(event) =>
              setForm((prev) => ({ ...prev, email: event.target.value }))
            }
            autoComplete="email"
          />
          <label className="muted" htmlFor="login-password">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            value={form.password}
            placeholder="Enter password"
            onChange={(event) =>
              setForm((prev) => ({ ...prev, password: event.target.value }))
            }
            autoComplete="current-password"
          />
          <div className="auth-helper">
            <Link href="/signup">Need an account?</Link>
            <button type="button" className="ghost" disabled>
              Forgot password?
            </button>
          </div>
          {error ? (
            <div className="auth-error" role="alert">
              {error}
            </div>
          ) : null}
          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
