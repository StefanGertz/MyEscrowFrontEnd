"use client";

import { useCallback, useEffect, useState } from "react";

type Health = {
  status: "healthy" | "attention";
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
};

type Job = {
  id: number;
  jobType: string;
  status: string;
  attemptCount: number;
  runAt: string;
  lastError?: string;
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

  const load = useCallback(async () => {
    try {
      setError("");
      const [healthResponse, jobsResponse] = await Promise.all([
        fetch("/api/operations/health", { cache: "no-store" }),
        fetch("/api/operations/jobs?status=failed", { cache: "no-store" }),
      ]);
      const [healthBody, jobsBody] = await Promise.all([
        readJson<Health>(healthResponse),
        readJson<{ jobs: Job[] }>(jobsResponse),
      ]);
      setHealth(healthBody);
      setJobs(jobsBody.jobs);
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
      </div>
    </main>
  );
}
