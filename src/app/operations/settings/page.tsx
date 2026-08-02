"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/apiClient";

type OperatorRole = "support" | "admin";

export default function OperationsSettingsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isHydrating, logout } = useAuth();
  const [currentRole, setCurrentRole] = useState<OperatorRole | null>(null);
  const [error, setError] = useState("");
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  useEffect(() => {
    if (isHydrating) return;
    if (!isAuthenticated || user?.role === "customer") {
      logout();
      router.replace("/operations/login");
      return;
    }

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await apiFetch("/api/operations/health", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json() as { currentRole?: OperatorRole; error?: string };
        if (!response.ok || !body.currentRole) {
          if (response.status === 401 || response.status === 403) {
            logout();
            router.replace("/operations/login");
            return;
          }
          throw new Error(body.error ?? "Unable to verify operator access.");
        }
        setCurrentRole(body.currentRole);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load operations settings.");
        }
      }
    })();
    return () => controller.abort();
  }, [isAuthenticated, isHydrating, logout, router, user?.role]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <header>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-teal-700">MyEscrow operations</p>
          <h1 className="mt-2 text-4xl font-bold text-slate-950">Settings</h1>
          <p className="mt-2 text-slate-600">Manage your operator identity and account security.</p>
        </header>

        {error ? <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">{error}</div> : null}

        <section className="mt-8 grid gap-6 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Operator account</p>
            <h2 className="mt-2 text-xl font-bold">Identity</h2>
            <dl className="mt-5 space-y-4">
              <div>
                <dt className="text-sm text-slate-500">Name</dt>
                <dd className="mt-1 font-bold text-slate-900">{user?.name ?? "Loading…"}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Email</dt>
                <dd className="mt-1 font-bold text-slate-900">{user?.email ?? "Loading…"}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Operations role</dt>
                <dd className="mt-1 font-bold capitalize text-slate-900">{currentRole ?? user?.role ?? "Verifying…"}</dd>
              </div>
            </dl>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Security</p>
            <h2 className="mt-2 text-xl font-bold">Password</h2>
            <p className="mt-3 text-slate-600">Update the password used for this operator account.</p>
            <button
              className="mt-5 rounded-xl bg-teal-300 px-5 py-3 font-bold text-slate-900 hover:bg-teal-200"
              type="button"
              onClick={() => setChangePasswordOpen(true)}
            >
              Change password
            </button>
          </article>
        </section>

        <aside className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-5 text-sm text-teal-950">
          Customer profile, wallet, payout, and bank-account settings are not available in the Operations portal.
        </aside>
      </div>

      {changePasswordOpen ? <ChangePasswordModal onClose={() => setChangePasswordOpen(false)} /> : null}
    </main>
  );
}
