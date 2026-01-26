"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";

export default function SignupPage() {
  const router = useRouter();
  const { signup, isAuthenticated, isHydrating } = useAuth();
  const { pushToast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
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
    if (!form.name || !form.email || !form.password) {
      setError("Fill in your name, email, and password.");
      return;
    }
    setSubmitting(true);
    try {
      await signup({
        name: form.name,
        email: form.email,
        password: form.password,
      });
      pushToast({
        variant: "success",
        title: "Account created. Let’s build your first escrow.",
      });
      router.replace("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign up.";
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
          <p className="auth-eyebrow">Create account</p>
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            Join MyEscrow
          </h1>
          <p className="lead">
            Collaborate with buyers and sellers using milestone-based payouts.
          </p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="muted" htmlFor="signup-name">
            Full name
          </label>
          <input
            id="signup-name"
            type="text"
            value={form.name}
            placeholder="Your name"
            onChange={(event) =>
              setForm((prev) => ({ ...prev, name: event.target.value }))
            }
            autoComplete="name"
          />
          <label className="muted" htmlFor="signup-email">
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            value={form.email}
            placeholder="you@example.com"
            onChange={(event) =>
              setForm((prev) => ({ ...prev, email: event.target.value }))
            }
            autoComplete="email"
          />
          <label className="muted" htmlFor="signup-password">
            Password
          </label>
          <input
            id="signup-password"
            type="password"
            value={form.password}
            placeholder="Create a password"
            onChange={(event) =>
              setForm((prev) => ({ ...prev, password: event.target.value }))
            }
            autoComplete="new-password"
          />
          {error ? (
            <div className="auth-error" role="alert">
              {error}
            </div>
          ) : null}
          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? "Creating account..." : "Create account"}
          </button>
          <div className="auth-footer">
            Already have a login? <Link href="/login">Sign in</Link>
          </div>
        </form>
      </div>
    </main>
  );
}
