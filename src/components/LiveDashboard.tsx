"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { NotificationTimestamp } from "@/components/NotificationTimestamp";
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
  counterpartyEmail: string;
  creatorRole: "buyer" | "seller";
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
    counterpartyEmail: "",
    creatorRole: "buyer",
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
    if (
      !escrowForm.title ||
      !escrowForm.counterpartyEmail ||
      Number.isNaN(amountValue) ||
      amountValue <= 0
    ) {
      setFormError("Add a title, counterparty email, and positive amount.");
      return;
    }
    try {
      const response = await createEscrow.mutateAsync({
        title: escrowForm.title,
        counterpartyEmail: escrowForm.counterpartyEmail,
        amount: amountValue,
        creatorRole: escrowForm.creatorRole,
        description: escrowForm.description || undefined,
      });
      const inviteMessage =
        response.invitationStatus === "signup_required"
          ? "Invitation sent. The counterparty must create and verify an account before review."
          : response.invitationStatus === "verification_required"
            ? "Invitation sent. The counterparty must verify their existing account before review."
            : "Escrow created in staging.";
      setEscrowForm({
        title: "",
        counterpartyEmail: "",
        creatorRole: "buyer",
        amount: "",
        description: "",
      });
      pushToast({ variant: "success", title: inviteMessage });
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
                    <div className="muted">
                      {notification.createdAt ? (
                        <NotificationTimestamp createdAt={notification.createdAt} />
                      ) : (
                        notification.meta
                      )}
                    </div>
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
              <label className="muted" htmlFor="escrow-counterparty-email">
                Counterparty email
              </label>
              <input
                id="escrow-counterparty-email"
                type="email"
                value={escrowForm.counterpartyEmail}
                onChange={(event) =>
                  setEscrowForm((prev) => ({ ...prev, counterpartyEmail: event.target.value }))
                }
                placeholder="counterparty@example.com"
              />
              <label className="muted" htmlFor="escrow-creator-role">
                I am the
              </label>
              <select
                id="escrow-creator-role"
                value={escrowForm.creatorRole}
                onChange={(event) =>
                  setEscrowForm((prev) => ({
                    ...prev,
                    creatorRole: event.target.value === "seller" ? "seller" : "buyer",
                  }))
                }
              >
                <option value="buyer">Buyer</option>
                <option value="seller">Seller</option>
              </select>
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
