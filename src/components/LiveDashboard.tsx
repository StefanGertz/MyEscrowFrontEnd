"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";
import {
  useCreateEscrow,
  useDisputes,
  useEscrowSummary,
  useEscrows,
  useNotifications,
} from "@/hooks/useDashboardData";

type EscrowFormState = {
  title: string;
  counterpart: string;
  amount: string;
  description: string;
};

export function LiveDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, isHydrating, logout } = useAuth();
  const { pushToast } = useToast();

  const overviewQuery = useEscrowSummary();
  const escrowsQuery = useEscrows();
  const disputesQuery = useDisputes();
  const notificationsQuery = useNotifications();
  const createEscrow = useCreateEscrow();

  const createFormRef = useRef<HTMLDivElement | null>(null);
  const [escrowForm, setEscrowForm] = useState<EscrowFormState>({
    title: "",
    counterpart: "",
    amount: "",
    description: "",
  });
  const [formError, setFormError] = useState<string | null>(null);

  const notificationCount = notificationsQuery.data?.notifications.length ?? 0;
  const displayName = user?.name?.trim() || user?.email || "Your account";

  const summaryMetrics = overviewQuery.data?.summaryMetrics ?? [];
  const disputes = disputesQuery.data?.disputes ?? [];
  const notifications = notificationsQuery.data?.notifications ?? [];
  const escrows = escrowsQuery.data?.escrows ?? [];

  const totalHeld = summaryMetrics.find((metric) => metric.id === "held")?.value ?? "$0";

  const scrollToForm = () => {
    createFormRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleEscrowSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const amountValue = Number(escrowForm.amount);
    if (!escrowForm.title || !escrowForm.counterpart || Number.isNaN(amountValue) || amountValue <= 0) {
      setFormError("Add a title, counterpart, and positive amount.");
      return;
    }
    try {
      await createEscrow.mutateAsync({
        title: escrowForm.title,
        counterpart: escrowForm.counterpart,
        amount: amountValue,
        description: escrowForm.description || undefined,
      });
      setEscrowForm({ title: "", counterpart: "", amount: "", description: "" });
      pushToast({ variant: "success", title: "Escrow created in staging." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create escrow.";
      setFormError(message);
      pushToast({ variant: "error", title: message });
    }
  };

  if (isHydrating) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <p className="auth-eyebrow">Loading account…</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    router.replace("/login");
    return null;
  }

  return (
    <AppShell screenId="live">
      <Header
        notificationCount={notificationCount}
        primaryLabel="New escrow"
        primaryDisabled={createEscrow.isPending}
        onPrimaryClick={scrollToForm}
        onLogoutClick={logout}
        onSettingsClick={scrollToForm}
        onAlertsClick={() => {
          const notificationsSection = document.getElementById("live-notifications");
          notificationsSection?.scrollIntoView({ behavior: "smooth" });
        }}
      />
      <main className="app-main live-dashboard">
        <section className="card live-summary-card">
          <div>
            <p className="muted" style={{ margin: 0 }}>
              Signed in as
            </p>
            <h2 style={{ margin: "4px 0 0" }}>{displayName}</h2>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Total held in escrow: {totalHeld}
            </p>
          </div>
          <button className="ghost" onClick={logout}>
            Log out
          </button>
        </section>

        <section className="dashboard-section">
          <div className="section-heading">
            <h3>Account metrics</h3>
            {overviewQuery.isLoading ? <span className="muted">Loading…</span> : null}
          </div>
          {summaryMetrics.length === 0 ? (
            <div className="card muted">No escrows yet. Create one to see live metrics.</div>
          ) : (
            <div className="summary-grid">
              {summaryMetrics.map((metric) => (
                <div key={metric.id} className="card summary-card">
                  <p className="muted" style={{ margin: 0 }}>
                    {metric.label}
                  </p>
                  <strong style={{ fontSize: 20 }}>{metric.value}</strong>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {metric.meta}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-grid">
          <div className="card list-card">
            <div className="section-heading">
              <h3>Active escrows</h3>
              {escrowsQuery.isLoading ? <span className="muted">Loading…</span> : null}
            </div>
            {escrows.length === 0 ? (
              <p className="muted">No escrows found for this account yet.</p>
            ) : (
              <ul className="list">
                {escrows.map((escrow) => (
                  <li key={escrow.id} className="list-item">
                    <div>
                      <strong>{escrow.counterpart}</strong>
                      <div className="muted">{escrow.stage}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div>{escrow.amount}</div>
                      <div className="muted">{escrow.due}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card list-card" id="live-notifications">
            <div className="section-heading">
              <h3>Notifications</h3>
              {notificationsQuery.isLoading ? <span className="muted">Loading…</span> : null}
            </div>
            {notifications.length === 0 ? (
              <p className="muted">No notifications yet.</p>
            ) : (
              <ul className="list">
                {notifications.map((notification) => (
                  <li key={notification.id} className="list-item">
                    <div>
                      <strong>{notification.label}</strong>
                      <div className="muted">{notification.detail}</div>
                    </div>
                    <div className="muted">{notification.meta}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="dashboard-grid">
          <div className="card list-card">
            <div className="section-heading">
              <h3>Disputes</h3>
              {disputesQuery.isLoading ? <span className="muted">Loading…</span> : null}
            </div>
            {disputes.length === 0 ? (
              <p className="muted">No open disputes for this account.</p>
            ) : (
              <ul className="list">
                {disputes.map((dispute) => (
                  <li key={dispute.id} className="list-item">
                    <div>
                      <strong>{dispute.title}</strong>
                      <div className="muted">{dispute.owner}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div>{dispute.amount}</div>
                      <div className="muted">{dispute.updated}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card create-card" ref={createFormRef}>
            <div className="section-heading">
              <h3>Create escrow</h3>
              {createEscrow.isPending ? <span className="muted">Submitting…</span> : null}
            </div>
            <form className="create-form" onSubmit={handleEscrowSubmit}>
              <label className="muted" htmlFor="escrow-title">
                Title
              </label>
              <input
                id="escrow-title"
                type="text"
                value={escrowForm.title}
                onChange={(event) => setEscrowForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Project name"
              />
              <label className="muted" htmlFor="escrow-counterpart">
                Counterparty
              </label>
              <input
                id="escrow-counterpart"
                type="text"
                value={escrowForm.counterpart}
                onChange={(event) =>
                  setEscrowForm((prev) => ({ ...prev, counterpart: event.target.value }))
                }
                placeholder="Acme Corp"
              />
              <label className="muted" htmlFor="escrow-amount">
                Amount (USD)
              </label>
              <input
                id="escrow-amount"
                type="number"
                min="0"
                value={escrowForm.amount}
                onChange={(event) => setEscrowForm((prev) => ({ ...prev, amount: event.target.value }))}
                placeholder="25000"
              />
              <label className="muted" htmlFor="escrow-description">
                Description (optional)
              </label>
              <textarea
                id="escrow-description"
                value={escrowForm.description}
                onChange={(event) =>
                  setEscrowForm((prev) => ({ ...prev, description: event.target.value }))
                }
                rows={3}
                placeholder="Outline the deliverables or milestones."
              />
              {formError ? (
                <div className="auth-error" role="alert">
                  {formError}
                </div>
              ) : null}
              <button className="btn" type="submit" disabled={createEscrow.isPending}>
                {createEscrow.isPending ? "Creating…" : "Create escrow"}
              </button>
            </form>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
