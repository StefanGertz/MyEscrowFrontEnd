"use client";

import { useCallback, useEffect, useState } from "react";

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
};

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
  const [health, setHealth] = useState<Health | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState<number | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [operatorEmail, setOperatorEmail] = useState("");
  const [operatorRole, setOperatorRole] = useState<"customer" | "support" | "admin">("support");
  const [savingRole, setSavingRole] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      const healthBody = await readJson<Health>(await fetch("/api/operations/health", { cache: "no-store" }));
      const [jobsBody, operatorsBody] = await Promise.all([
        readJson<{ jobs: Job[] }>(await fetch("/api/operations/jobs?status=failed", { cache: "no-store" })),
        healthBody.currentRole === "admin"
          ? readJson<{ operators: Operator[] }>(await fetch("/api/operations/operators", { cache: "no-store" }))
          : Promise.resolve({ operators: [] }),
      ]);
      setHealth(healthBody);
      setJobs(jobsBody.jobs);
      setOperators(operatorsBody.operators);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load operations data.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = async (jobId: number) => {
    try {
      setRetrying(jobId);
      const response = await fetch(`/api/operations/jobs/${jobId}/retry`, {
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
      const response = await fetch("/api/operations/operators/role", {
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

  const metrics = health
    ? [
        ["Failed invitation jobs", health.counts.failedOutbox],
        ["Failed recovery jobs", health.counts.failedJobs],
        ["Aged active escrows", health.counts.agedEscrows],
        ["Disputes near deadline", health.counts.disputesApproaching],
        ["Safe command replays", health.counts.duplicateCommandAttempts],
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
          <button className="rounded-xl bg-teal-300 px-5 py-3 font-bold text-slate-900" onClick={() => void load()}>
            Refresh
          </button>
        </div>

        {error ? <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">{error}</div> : null}

        {health ? (
          <>
            <section className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              {metrics.map(([label, value]) => (
                <article key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="mt-2 text-3xl font-bold">{value}</p>
                </article>
              ))}
            </section>

            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
            </section>
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
