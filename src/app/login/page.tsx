"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <main className="auth-page auth-page--login">
      <div className="auth-card">
        <p className="auth-eyebrow">Sign in</p>
        <p className="lead">Loading sign-in screen...</p>
      </div>
    </main>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitedEmail = searchParams.get("email") ?? "";
  const inviteReference = searchParams.get("invite") ?? "";
  const { login, isAuthenticated, isHydrating } = useAuth();
  const { pushToast } = useToast();
  const [form, setForm] = useState({ email: invitedEmail, password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (invitedEmail) {
      setForm((prev) => ({ ...prev, email: invitedEmail }));
    }
  }, [invitedEmail]);

  useEffect(() => {
    if (!isHydrating && isAuthenticated) {
      router.replace(inviteReference ? "/?screen=dashboard" : "/");
    }
  }, [inviteReference, isHydrating, isAuthenticated, router]);

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
        title: inviteReference
          ? `Welcome back. Invitation ${inviteReference} is ready to review.`
          : "Welcome back!",
      });
      router.replace(inviteReference ? "/?screen=dashboard" : "/");
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

  const signupParams = new URLSearchParams();
  if (invitedEmail) {
    signupParams.set("email", invitedEmail);
  }
  if (inviteReference) {
    signupParams.set("invite", inviteReference);
  }
  const signupHref = signupParams.size ? `/signup?${signupParams.toString()}` : "/signup";

  return (
    <main className="auth-page auth-page--login">
      <section className="login-showcase" aria-label="MyEscrow">
        <Link className="login-brand" href="/login" aria-label="MyEscrow sign in">
          <Image src="/myescrow-mark.svg" alt="" width={48} height={48} priority />
          <span>MyEscrow</span>
        </Link>

        <div className="login-showcase__content">
          <p className="login-showcase__eyebrow">
            <span aria-hidden="true">●</span> Secure by design
          </p>
          <h1>Confidence in every transaction.</h1>
          <p>
            Clear agreements, protected funds, and milestone-based releases—all in one secure place.
          </p>

          <div className="login-security-visual" aria-hidden="true">
            <div className="login-security-visual__orbit" />
            <div className="login-security-visual__shield">
              <svg viewBox="0 0 64 72" role="presentation">
                <path d="M32 3 57 13v19c0 17-10.5 29.5-25 36C17.5 61.5 7 49 7 32V13L32 3Z" />
                <path d="m21 35 7 7 15-17" />
              </svg>
            </div>
            <span>Funds protected</span>
          </div>
        </div>

        <div className="login-showcase__trust">
          <span>Protected funds</span>
          <span>Transparent milestones</span>
          <span>Secure agreements</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="auth-card login-card">
          <div className="login-card__heading">
            <p className="auth-eyebrow">Welcome back</p>
            <h2>Sign in to MyEscrow</h2>
            <p>
              {inviteReference
                ? `Sign in to continue escrow invitation ${inviteReference}.`
                : "Enter your details to access your secure account."}
            </p>
          </div>
          <form className="auth-form login-form" onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="login-email">Email address</label>
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
            </div>
            <div className="login-field">
              <div className="login-field__heading">
                <label htmlFor="login-password">Password</label>
                <Link href="/forgot-password">Forgot password?</Link>
              </div>
              <input
                id="login-password"
                type="password"
                value={form.password}
                placeholder="Enter your password"
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, password: event.target.value }))
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
              {submitting ? "Signing in..." : "Sign in"}
              {!submitting ? <span aria-hidden="true">→</span> : null}
            </button>
            <div className="auth-helper login-helper">
              <span>New to MyEscrow?</span> <Link href={signupHref}>Create an account</Link>
            </div>
          </form>
          <p className="login-card__security"><span aria-hidden="true">✓</span> Your connection is secure and encrypted</p>
        </div>
      </section>
    </main>
  );
}
