"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";

export default function OperationsLoginPage() {
  const router = useRouter();
  const { operationsLogin, isAuthenticated, isHydrating, user } = useAuth();
  const { pushToast } = useToast();
  const [form, setForm] = useState({ email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isHydrating && isAuthenticated && user?.role !== "customer") {
      router.replace("/operations");
    }
  }, [isAuthenticated, isHydrating, router, user?.role]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!form.email || !form.password) {
      setError("Enter your email and password.");
      return;
    }

    setSubmitting(true);
    try {
      await operationsLogin({ email: form.email, password: form.password });
      pushToast({
        variant: "success",
        title: "Welcome to MyEscrow Operations.",
      });
      router.replace("/operations");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign in.";
      setError(message);
      pushToast({ variant: "error", title: message });
    } finally {
      setSubmitting(false);
    }
  };

  if (isHydrating || (isAuthenticated && user?.role !== "customer")) {
    return (
      <main className="auth-page auth-page--login">
        <div className="auth-card">
          <p className="auth-eyebrow">Operations</p>
          <p className="lead">Loading operations sign-in...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page auth-page--login">
      <section className="login-showcase" aria-label="MyEscrow Operations">
        <Link
          className="login-brand"
          href="/operations/login"
          aria-label="MyEscrow Operations sign in"
        >
          <Image src="/myescrow-mark.svg" alt="" width={48} height={48} priority />
          <span>MyEscrow</span>
        </Link>

        <div className="login-showcase__content">
          <p className="login-showcase__eyebrow">
            <span aria-hidden="true">●</span> Authorized access only
          </p>
          <h1>Operations control centre.</h1>
          <p>
            Monitor recovery health, investigate alerts, and safely manage operational work.
          </p>

          <div className="login-security-visual" aria-hidden="true">
            <div className="login-security-visual__orbit" />
            <div className="login-security-visual__shield">
              <svg viewBox="0 0 64 72" role="presentation">
                <path d="M32 3 57 13v19c0 17-10.5 29.5-25 36C17.5 61.5 7 49 7 32V13L32 3Z" />
                <path d="m21 35 7 7 15-17" />
              </svg>
            </div>
            <span>Restricted portal</span>
          </div>
        </div>

        <div className="login-showcase__trust">
          <span>Permissioned access</span>
          <span>Audited actions</span>
          <span>Secure recovery</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="auth-card login-card">
          <div className="login-card__heading">
            <p className="auth-eyebrow">Operations portal</p>
            <h2>Sign in to Operations</h2>
            <p>Use your authorized operator account to continue.</p>
          </div>

          <form className="auth-form login-form" onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="operations-login-email">Email address</label>
              <input
                id="operations-login-email"
                type="email"
                value={form.email}
                placeholder="operator@example.com"
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, email: event.target.value }))
                }
                autoComplete="email"
                autoFocus
              />
            </div>

            <div className="login-field">
              <div className="login-field__heading">
                <label htmlFor="operations-login-password">Password</label>
                <Link href="/forgot-password">Forgot password?</Link>
              </div>
              <input
                id="operations-login-password"
                type="password"
                value={form.password}
                placeholder="Enter your password"
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, password: event.target.value }))
                }
                autoComplete="current-password"
              />
            </div>

            {error ? (
              <div className="auth-error" role="alert">
                {error}
              </div>
            ) : null}

            <button className="btn login-submit" type="submit" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign in to Operations"}
              {!submitting ? <span aria-hidden="true">→</span> : null}
            </button>
          </form>

          <p className="login-card__security">
            <span aria-hidden="true">✓</span> Access is restricted to authorized operators
          </p>
        </div>
      </section>
    </main>
  );
}
