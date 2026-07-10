"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupFallback />}>
      <SignupContent />
    </Suspense>
  );
}

function SignupFallback() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="auth-eyebrow">Create account</p>
        <p className="lead">Loading signup screen...</p>
      </div>
    </main>
  );
}

function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitedEmail = searchParams.get("email") ?? "";
  const inviteReference = searchParams.get("invite") ?? "";
  const { signup, isAuthenticated, isHydrating } = useAuth();
  const { pushToast } = useToast();
  const [form, setForm] = useState({
    name: "",
    email: invitedEmail,
    password: "",
    confirmPassword: "",
    partyType: "individual" as "individual" | "business",
    business: {
      legalName: "",
      representativeTitle: "",
    },
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (invitedEmail) {
      setForm((prev) => ({ ...prev, email: invitedEmail }));
    }
  }, [invitedEmail]);

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

  useEffect(() => {
    if (!isHydrating && isAuthenticated) {
      router.replace(inviteReference ? "/?screen=dashboard" : "/");
    }
  }, [inviteReference, isHydrating, isAuthenticated, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!form.name || !form.email || !form.password) {
      setError("Fill in your name, email, and password.");
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
    if (inviteReference && form.partyType === "business") {
      if (!form.business.legalName.trim() || !form.business.representativeTitle.trim()) {
        setError("Enter the business name and your title.");
        return;
      }
    }
    setSubmitting(true);
    try {
      const result = await signup({
        name: form.name,
        email: form.email,
        password: form.password,
        ...(inviteReference
          ? {
              partyType: form.partyType,
              ...(form.partyType === "business"
                ? {
                    business: {
                      legalName: form.business.legalName.trim(),
                      representativeTitle: form.business.representativeTitle.trim(),
                    },
                  }
                : {}),
            }
          : {}),
      });
      if (result.status === "session") {
        pushToast({
          variant: "success",
          title: inviteReference
            ? `Account created. Invitation ${inviteReference} is ready to review.`
            : "Account created. Let's build your first escrow.",
        });
        router.replace(inviteReference ? "/?screen=dashboard" : "/");
        return;
      }
      pushToast({
        variant: "info",
        title: "Verify your email",
        body: inviteReference
          ? "We emailed you a six-digit code. It may take a few minutes; check spam or junk too. After verification, your invitation will be ready to review."
          : "We emailed you a six-digit code. It may take a few minutes; check spam or junk too.",
      });
      const params = new URLSearchParams({ email: result.email });
      if (inviteReference) {
        params.set("invite", inviteReference);
      }
      if (result.debugCode) {
        params.set("debugCode", result.debugCode);
      }
      if (result.expiresAt) {
        params.set("expiresAt", result.expiresAt);
      }
      router.push(`/verify-email?${params.toString()}`);
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

  const loginParams = new URLSearchParams();
  if (invitedEmail) {
    loginParams.set("email", invitedEmail);
  }
  if (inviteReference) {
    loginParams.set("invite", inviteReference);
  }
  const loginHref = loginParams.size ? `/login?${loginParams.toString()}` : "/login";

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div>
          <p className="auth-eyebrow">Create account</p>
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            Join MyEscrow
          </h1>
          <p className="lead">
            {inviteReference
              ? `Create your account to continue escrow invitation ${inviteReference}.`
              : "Collaborate with buyers and sellers using milestone-based payouts."}
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
          {inviteReference ? (
            <div className="create-form-section">
              <div className="muted create-form-label">You are joining this escrow as</div>
              <div className="role-toggle create-form-role">
                {(["individual", "business"] as const).map((partyType) => (
                  <label
                    key={partyType}
                    className={`role-option ${form.partyType === partyType ? "active" : ""}`}
                    onClick={() => setForm((prev) => ({ ...prev, partyType }))}
                  >
                    <input type="radio" name="signup-party-type" checked={form.partyType === partyType} readOnly />
                    <span className="role-copy">{partyType === "individual" ? "Myself" : "A business"}</span>
                  </label>
                ))}
              </div>
              {form.partyType === "business" ? (
                <div className="business-identity-fields">
                  <div className="form-field">
                    <label className="muted" htmlFor="signup-business-name">
                      Business Name
                    </label>
                    <input
                      id="signup-business-name"
                      type="text"
                      value={form.business.legalName}
                      placeholder="Business legal name"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          business: { ...prev.business, legalName: event.target.value },
                        }))
                      }
                      autoComplete="organization"
                    />
                  </div>
                  <div className="form-field">
                    <label className="muted" htmlFor="signup-business-title">
                      Your Title
                    </label>
                    <input
                      id="signup-business-title"
                      type="text"
                      value={form.business.representativeTitle}
                      placeholder="Director, owner, officer"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          business: { ...prev.business, representativeTitle: event.target.value },
                        }))
                      }
                      autoComplete="organization-title"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
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
          <label className="muted" htmlFor="signup-confirm">
            Confirm password
          </label>
          <input
            id="signup-confirm"
            type="password"
            value={form.confirmPassword}
            placeholder="Repeat your password"
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
          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? "Creating account..." : "Create account"}
          </button>
          <div className="auth-footer">
            Already have a login? <Link href={loginHref}>Sign in</Link>
          </div>
        </form>
      </div>
    </main>
  );
}
