"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/apiClient";

type Health = {
  status: "healthy" | "attention";
  currentRole: "support" | "admin";
  counts: {
    failedOutbox: number;
    failedJobs: number;
    agedEscrows: number;
    duplicateCommandAttempts: number;
    disputesApproaching: number;
  };
  alerts: string[];
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
      status: string;
      attemptCount: number;
      nextAttemptAt: string;
      lastError?: string | null;
      updatedAt: string;
      invitationDelivery: {
        recipient: string;
        escrow: { reference: string; title: string };
      };
    }>;
    failedJobs: Array<{
      id: number;
      jobType: string;
      status: string;
      attemptCount: number;
      maxAttempts: number;
      runAt: string;
      lastError?: string | null;
      updatedAt: string;
    }>;
    agedEscrows: Array<{
      reference: string;
      title: string;
      lifecycleStatus: string;
      fundingStatus: string;
      amountCents: number;
      counterpartyEmail: string;
      createdAt: string;
      updatedAt: string;
    }>;
    duplicateCommands: Array<{
      id: number;
      command: string;
      replayCount: number;
      lastReplayedAt?: string | null;
      createdAt: string;
      user: { name: string; email: string };
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

type MetricKey = keyof Health["details"];

const metricLabels: Record<MetricKey, string> = {
  failedOutbox: "Failed invitation jobs",
  failedJobs: "Failed recovery jobs",
  agedEscrows: "Aged active escrows",
  disputesApproaching: "Disputes near deadline",
  duplicateCommands: "Safe command replays",
};

const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString() : "Not recorded";
const formatMoney = (value: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value / 100);
const formatStatus = (value: string) => value.replaceAll("_", " ");

function MetricDetails({ health, metric }: { health: Health; metric: MetricKey }) {
  const records = health.details[metric];
  if (records.length === 0) {
    return <p className="mt-4 text-slate-600">No records currently contribute to this metric.</p>;
  }

  return (
    <div className="mt-4 space-y-3">
      {metric === "failedOutbox" ? health.details.failedOutbox.map((record) => (
        <article key={record.id} className="rounded-xl bg-slate-50 p-4">
          <p className="font-bold">{record.invitationDelivery.escrow.title} · {record.invitationDelivery.escrow.reference}</p>
          <p className="mt-1 text-sm text-slate-600">{record.eventType} to {record.invitationDelivery.recipient}; attempt {record.attemptCount}</p>
          <p className="mt-1 text-sm text-rose-700">{record.lastError ?? "No error detail recorded"}</p>
          <p className="mt-1 text-xs text-slate-500">Next retry: {formatDateTime(record.nextAttemptAt)}</p>
        </article>
      )) : null}
      {metric === "failedJobs" ? health.details.failedJobs.map((record) => (
        <article key={record.id} className="rounded-xl bg-slate-50 p-4">
          <p className="font-bold">{formatStatus(record.jobType)}</p>
          <p className="mt-1 text-sm text-slate-600">Attempt {record.attemptCount} of {record.maxAttempts}; scheduled {formatDateTime(record.runAt)}</p>
          <p className="mt-1 text-sm text-rose-700">{record.lastError ?? "No error detail recorded"}</p>
        </article>
      )) : null}
      {metric === "agedEscrows" ? health.details.agedEscrows.map((record) => (
        <Link
          key={record.reference}
          href={`/operations/escrows/${encodeURIComponent(record.reference)}`}
          className="block rounded-xl bg-slate-50 p-4 transition hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
          aria-label={`View escrow details for ${record.title}, ${record.reference}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-bold">{record.title} · {record.reference}</p>
              <p className="mt-1 text-sm text-slate-600">{formatStatus(record.lifecycleStatus)}; funding {formatStatus(record.fundingStatus)}</p>
              <p className="mt-1 text-sm text-slate-500">Counterparty: {record.counterpartyEmail}</p>
            </div>
            <p className="font-bold">{formatMoney(record.amountCents)}</p>
          </div>
          <p className="mt-2 text-xs text-slate-500">Last activity: {formatDateTime(record.updatedAt)}</p>
          <p className="mt-3 text-xs font-bold uppercase tracking-wide text-teal-700">View escrow details</p>
        </Link>
      )) : null}
      {metric === "duplicateCommands" ? health.details.duplicateCommands.map((record) => (
        <article key={record.id} className="rounded-xl bg-slate-50 p-4">
          <p className="font-bold">{formatStatus(record.command)}</p>
          <p className="mt-1 text-sm text-slate-600">Safely replayed {record.replayCount} time(s) by {record.user.name || record.user.email}</p>
          <p className="mt-1 text-xs text-slate-500">Last replay: {formatDateTime(record.lastReplayedAt)}</p>
        </article>
      )) : null}
      {metric === "disputesApproaching" ? health.details.disputesApproaching.map((record) => (
        <article key={record.reference} className="rounded-xl bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-bold">{record.title} · {record.reference}</p>
              <p className="mt-1 text-sm text-slate-600">{record.escrow ? `${record.escrow.title} · ${record.escrow.reference}; ` : ""}{formatStatus(record.status)}; {record.priority} priority</p>
            </div>
            <p className="font-bold">{formatMoney(record.amountFrozenCents)} frozen</p>
          </div>
          <p className="mt-2 text-xs text-slate-500">Evidence deadline: {formatDateTime(record.evidenceWindowEndsAt)}</p>
        </article>
      )) : null}
    </div>
  );
}

type Job = {
  id: number;
  jobType: string;
  status: string;
  attemptCount: number;
  runAt: string;
  lastError?: string;
};

type Operator = {
  id: string;
  name: string;
  email: string;
  role: "support" | "admin";
  emailVerified: boolean;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Unable to load operations data.");
  return body as T;
}

export default function OperationsPage() {
  const router = useRouter();
  const { isAuthenticated, isHydrating, logout } = useAuth();
  const [health, setHealth] = useState<Health | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [retrying, setRetrying] = useState<number | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [operatorEmail, setOperatorEmail] = useState("");
  const [operatorRole, setOperatorRole] = useState<"customer" | "support" | "admin">("support");
  const [savingRole, setSavingRole] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey | null>(null);

  const load = useCallback(async () => {
    try {
      setIsRefreshing(true);
      setError("");
      const healthBody = await readJson<Health>(await apiFetch("/api/operations/health", { cache: "no-store" }));
      const [jobsBody, operatorsBody] = await Promise.all([
        readJson<{ jobs: Job[] }>(await apiFetch("/api/operations/jobs?status=failed", { cache: "no-store" })),
        healthBody.currentRole === "admin"
          ? readJson<{ operators: Operator[] }>(await apiFetch("/api/operations/operators", { cache: "no-store" }))
          : Promise.resolve({ operators: [] }),
      ]);
      setHealth(healthBody);
      setJobs(jobsBody.jobs);
      setOperators(operatorsBody.operators);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load operations data.");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  useEffect(() => {
    if (isHydrating) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    void load();
  }, [isAuthenticated, isHydrating, load, router]);

  const retry = async (jobId: number) => {
    try {
      setRetrying(jobId);
      const response = await apiFetch(`/api/operations/jobs/${jobId}/retry`, {
        method: "POST",
        headers: { "Idempotency-Key": `operations-retry-${jobId}-${crypto.randomUUID()}` },
      });
      await readJson(response);
      await load();
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Unable to retry this job.");
    } finally {
      setRetrying(null);
    }
  };

  const saveOperatorRole = async () => {
    try {
      setSavingRole(true);
      setError("");
      const response = await apiFetch("/api/operations/operators/role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `operator-role-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({ email: operatorEmail, role: operatorRole }),
      });
      await readJson(response);
      setOperatorEmail("");
      await load();
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : "Unable to change operator access.");
    } finally {
      setSavingRole(false);
    }
  };

  const metrics: Array<{ key: MetricKey; label: string; value: number }> = health
    ? [
        { key: "failedOutbox", label: metricLabels.failedOutbox, value: health.counts.failedOutbox },
        { key: "failedJobs", label: metricLabels.failedJobs, value: health.counts.failedJobs },
        { key: "agedEscrows", label: metricLabels.agedEscrows, value: health.counts.agedEscrows },
        { key: "disputesApproaching", label: metricLabels.disputesApproaching, value: health.counts.disputesApproaching },
        { key: "duplicateCommands", label: metricLabels.duplicateCommands, value: health.counts.duplicateCommandAttempts },
      ]
    : [];

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-teal-700">MyEscrow operations</p>
            <h1 className="mt-2 text-4xl font-bold text-slate-950">Recovery health</h1>
            <p className="mt-2 text-slate-600">Failed work is visible, permissioned, audited, and safe to retry.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-bold text-slate-700 hover:bg-slate-100"
              onClick={handleLogout}
            >
              Log out
            </button>
            <button
              type="button"
              className="rounded-xl bg-teal-300 px-5 py-3 font-bold text-slate-900 disabled:cursor-wait disabled:opacity-60"
              disabled={isRefreshing}
              aria-busy={isRefreshing}
              onClick={() => void load()}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {error ? <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">{error}</div> : null}

        {health ? (
          <>
            <section className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              {metrics.map((metric) => (
                <button
                  key={metric.key}
                  type="button"
                  className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${selectedMetric === metric.key ? "border-teal-500 ring-2 ring-teal-100" : "border-slate-200"}`}
                  aria-expanded={selectedMetric === metric.key}
                  aria-controls="operations-metric-details"
                  onClick={() => setSelectedMetric(metric.key)}
                >
                  <p className="text-sm text-slate-500">{metric.label}</p>
                  <p className="mt-2 text-3xl font-bold">{metric.value}</p>
                  <p className="mt-3 text-xs font-bold uppercase tracking-wide text-teal-700">View details</p>
                </button>
              ))}
            </section>

            {selectedMetric ? (
              <section id="operations-metric-details" className="mt-4 rounded-2xl border border-teal-200 bg-white p-6 shadow-sm" aria-live="polite">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">{metricLabels[selectedMetric]}</h2>
                  <button type="button" className="rounded-lg px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100" onClick={() => setSelectedMetric(null)}>
                    Close
                  </button>
                </div>
                <MetricDetails health={health} metric={selectedMetric} />
              </section>
            ) : null}

            <Link
              href="/operations/alerts"
              className="mt-6 block rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-teal-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
              aria-label="View current alert details"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold">Current alerts</h2>
                <span className={`rounded-full px-3 py-1 text-sm font-bold ${health.status === "healthy" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                  {health.status}
                </span>
              </div>
              {health.alerts.length ? (
                <ul className="mt-4 list-disc space-y-2 pl-5 text-slate-700">
                  {health.alerts.map((alert) => <li key={alert}>{alert}</li>)}
                </ul>
              ) : <p className="mt-4 text-slate-600">No operational alerts are open.</p>}
              {health.latestReconciliation ? (
                <p className="mt-4 text-sm text-slate-500">
                  Latest reconciliation: {health.latestReconciliation.status}; {health.latestReconciliation.checkedEscrows} escrows checked; {health.latestReconciliation.exceptionCount} exceptions.
                </p>
              ) : null}
              <p className="mt-2 text-sm text-slate-500">
                Recovery worker: {health.worker.status}
                {health.worker.lastSuccessAt ? `; last successful cycle ${new Date(health.worker.lastSuccessAt).toLocaleString()}` : "; no successful cycle recorded"}.
              </p>
              <p className="mt-4 text-xs font-bold uppercase tracking-wide text-teal-700">View alert details</p>
            </Link>
          </>
        ) : null}

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Failed recovery jobs</h2>
          {jobs.length === 0 ? <p className="mt-4 text-slate-600">No failed recovery jobs.</p> : (
            <div className="mt-4 space-y-3">
              {jobs.map((job) => (
                <article key={job.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-50 p-4">
                  <div>
                    <p className="font-bold">{job.jobType}</p>
                    <p className="text-sm text-slate-500">Attempt {job.attemptCount}: {job.lastError ?? "No error detail"}</p>
                  </div>
                  <button
                    className="rounded-xl bg-teal-300 px-4 py-2 font-bold text-slate-900 disabled:opacity-50"
                    disabled={retrying === job.id}
                    onClick={() => void retry(job.id)}
                  >
                    {retrying === job.id ? "Queuing..." : "Retry safely"}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        {health?.currentRole === "admin" ? (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">Operator access</h2>
            <p className="mt-2 text-sm text-slate-600">Only verified existing accounts can receive access. Every change is idempotent and audited.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr,180px,auto]">
              <input
                className="rounded-xl border border-slate-300 px-4 py-3"
                type="email"
                placeholder="verified.user@example.com"
                value={operatorEmail}
                onChange={(event) => setOperatorEmail(event.target.value)}
              />
              <select
                className="rounded-xl border border-slate-300 px-4 py-3"
                value={operatorRole}
                onChange={(event) => setOperatorRole(event.target.value as "customer" | "support" | "admin")}
              >
                <option value="support">Support</option>
                <option value="admin">Administrator</option>
                <option value="customer">Revoke access</option>
              </select>
              <button
                className="rounded-xl bg-teal-300 px-5 py-3 font-bold text-slate-900 disabled:opacity-50"
                disabled={savingRole || !operatorEmail.trim()}
                onClick={() => void saveOperatorRole()}
              >
                {savingRole ? "Saving..." : "Update access"}
              </button>
            </div>
            <div className="mt-5 space-y-2">
              {operators.map((operator) => (
                <div key={operator.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <div>
                    <p className="font-bold">{operator.name}</p>
                    <p className="text-sm text-slate-500">{operator.email}</p>
                  </div>
                  <span className="rounded-full bg-slate-200 px-3 py-1 text-sm font-bold">{operator.role}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
