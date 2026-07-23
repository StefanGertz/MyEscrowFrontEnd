"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/apiClient";

type Health = {
  status: "healthy" | "attention";
  alerts: string[];
  counts: {
    failedOutbox: number;
    failedJobs: number;
    agedEscrows: number;
    disputesApproaching: number;
  };
  latestReconciliation?: {
    status: string;
    checkedEscrows: number;
    exceptionCount: number;
    completedAt?: string;
  };
  worker: {
    status: "healthy" | "stale";
    lastSuccessAt?: string | null;
    lastError?: string | null;
  };
  details: {
    failedOutbox: Array<{
      id: number;
      eventType: string;
      attemptCount: number;
      nextAttemptAt: string;
      lastError?: string | null;
      invitationDelivery: {
        recipient: string;
        escrow: { reference: string; title: string };
      };
    }>;
    failedJobs: Array<{
      id: number;
      jobType: string;
      attemptCount: number;
      maxAttempts: number;
      runAt: string;
      lastError?: string | null;
    }>;
    agedEscrows: Array<{
      reference: string;
      title: string;
      lifecycleStatus: string;
      fundingStatus: string;
      amountCents: number;
      counterpartyEmail: string;
      updatedAt: string;
    }>;
    disputesApproaching: Array<{
      reference: string;
      title: string;
      status: string;
      priority: string;
      amountFrozenCents: number;
      evidenceWindowEndsAt?: string | null;
      escrow?: { reference: string; title: string } | null;
    }>;
  };
};

const date = (value?: string | null) => value ? new Date(value).toLocaleString() : "Not recorded";
const money = (value: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value / 100);
const label = (value: string) => value.replaceAll("_", " ");

function AlertGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

const escrowCardClass = "block rounded-xl bg-slate-50 p-4 transition hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600";

export default function OperationsAlertsPage() {
  const router = useRouter();
  const { isAuthenticated, isHydrating } = useAuth();
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isHydrating) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await apiFetch("/api/operations/health", { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load alert details.");
        setHealth(body as Health);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load alert details.");
        }
      }
    })();
    return () => controller.abort();
  }, [isAuthenticated, isHydrating, router]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <Link href="/operations" className="text-sm font-bold text-teal-700 hover:underline">← Back to operations</Link>
        <header className="mt-6">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-teal-700">MyEscrow operations</p>
          <h1 className="mt-2 text-4xl font-bold text-slate-950">Current alert details</h1>
          <p className="mt-2 text-slate-600">Open an escrow-linked alert to inspect its transaction and agreement.</p>
        </header>

        {error ? <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">{error}</div> : null}
        {!health && !error ? <p className="mt-8 text-slate-600">Loading alert details...</p> : null}

        {health?.alerts.length === 0 ? (
          <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
            <h2 className="text-xl font-bold text-emerald-900">No current alerts</h2>
            <p className="mt-2 text-emerald-800">The recovery worker and monitored operations are healthy.</p>
          </section>
        ) : null}

        {health?.worker.status === "stale" ? (
          <AlertGroup title="Recovery worker">
            <article className="rounded-xl bg-amber-50 p-4 text-amber-950">
              <p className="font-bold">Worker heartbeat is stale</p>
              <p className="mt-1 text-sm">Last successful cycle: {date(health.worker.lastSuccessAt)}</p>
              {health.worker.lastError ? <p className="mt-2 text-sm text-rose-800">{health.worker.lastError}</p> : null}
            </article>
          </AlertGroup>
        ) : null}

        {health && health.counts.failedOutbox > 0 ? (
          <AlertGroup title="Failed invitation jobs">
            {health.details.failedOutbox.map((record) => (
              <Link key={record.id} href={`/operations/escrows/${encodeURIComponent(record.invitationDelivery.escrow.reference)}`} className={escrowCardClass}>
                <p className="font-bold">{record.invitationDelivery.escrow.title} · {record.invitationDelivery.escrow.reference}</p>
                <p className="mt-1 text-sm text-slate-600">{record.eventType} to {record.invitationDelivery.recipient}; attempt {record.attemptCount}</p>
                <p className="mt-1 text-sm text-rose-700">{record.lastError ?? "No error detail recorded"}</p>
                <p className="mt-2 text-xs text-slate-500">Next retry: {date(record.nextAttemptAt)}</p>
                <p className="mt-3 text-xs font-bold uppercase tracking-wide text-teal-700">View escrow details</p>
              </Link>
            ))}
          </AlertGroup>
        ) : null}

        {health && health.counts.failedJobs > 0 ? (
          <AlertGroup title="Failed recovery jobs">
            {health.details.failedJobs.map((record) => (
              <article key={record.id} className="rounded-xl bg-slate-50 p-4">
                <p className="font-bold capitalize">{label(record.jobType)}</p>
                <p className="mt-1 text-sm text-slate-600">Attempt {record.attemptCount} of {record.maxAttempts}; scheduled {date(record.runAt)}</p>
                <p className="mt-1 text-sm text-rose-700">{record.lastError ?? "No error detail recorded"}</p>
              </article>
            ))}
          </AlertGroup>
        ) : null}

        {health && health.counts.agedEscrows > 0 ? (
          <AlertGroup title="Aged active escrows">
            {health.details.agedEscrows.map((record) => (
              <Link key={record.reference} href={`/operations/escrows/${encodeURIComponent(record.reference)}`} className={escrowCardClass}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{record.title} · {record.reference}</p>
                    <p className="mt-1 text-sm capitalize text-slate-600">{label(record.lifecycleStatus)}; funding {label(record.fundingStatus)}</p>
                    <p className="mt-1 text-sm text-slate-500">Counterparty: {record.counterpartyEmail}</p>
                  </div>
                  <p className="font-bold">{money(record.amountCents)}</p>
                </div>
                <p className="mt-2 text-xs text-slate-500">Last activity: {date(record.updatedAt)}</p>
                <p className="mt-3 text-xs font-bold uppercase tracking-wide text-teal-700">View escrow details</p>
              </Link>
            ))}
          </AlertGroup>
        ) : null}

        {health && health.counts.disputesApproaching > 0 ? (
          <AlertGroup title="Disputes near deadline">
            {health.details.disputesApproaching.map((record) => {
              const content = (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{record.title} · {record.reference}</p>
                      <p className="mt-1 text-sm capitalize text-slate-600">{label(record.status)}; {record.priority} priority</p>
                    </div>
                    <p className="font-bold">{money(record.amountFrozenCents)} frozen</p>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Evidence deadline: {date(record.evidenceWindowEndsAt)}</p>
                  {record.escrow ? <p className="mt-3 text-xs font-bold uppercase tracking-wide text-teal-700">View escrow details</p> : null}
                </>
              );
              return record.escrow ? (
                <Link key={record.reference} href={`/operations/escrows/${encodeURIComponent(record.escrow.reference)}`} className={escrowCardClass}>{content}</Link>
              ) : (
                <article key={record.reference} className="rounded-xl bg-slate-50 p-4">{content}</article>
              );
            })}
          </AlertGroup>
        ) : null}

        {health?.latestReconciliation?.status === "exception" ? (
          <AlertGroup title="Reconciliation exceptions">
            <article className="rounded-xl bg-amber-50 p-4 text-amber-950">
              <p className="font-bold">{health.latestReconciliation.exceptionCount} exception(s) detected</p>
              <p className="mt-1 text-sm">{health.latestReconciliation.checkedEscrows} escrows checked; completed {date(health.latestReconciliation.completedAt)}.</p>
            </article>
          </AlertGroup>
        ) : null}
      </div>
    </main>
  );
}
