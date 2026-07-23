"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/apiClient";
import type { EscrowRecord } from "@/lib/mockDashboard";

const label = (value?: string) => value ? value.replaceAll("_", " ") : "Not recorded";
const date = (value?: string) => value ? new Date(value).toLocaleString() : "Not recorded";

export default function OperationsEscrowPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated, isHydrating } = useAuth();
  const [escrow, setEscrow] = useState<EscrowRecord | null>(null);
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
        const response = await apiFetch(`/api/operations/escrows/${encodeURIComponent(id)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load escrow details.");
        setEscrow(body.escrow as EscrowRecord);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load escrow details.");
        }
      }
    })();
    return () => controller.abort();
  }, [id, isAuthenticated, isHydrating, router]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <Link href="/operations" className="text-sm font-bold text-teal-700 hover:underline">← Back to operations</Link>

        {error ? <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">{error}</div> : null}
        {!escrow && !error ? <p className="mt-8 text-slate-600">Loading escrow details...</p> : null}

        {escrow ? (
          <>
            <header className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-teal-700">Escrow {escrow.id}</p>
              <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold text-slate-950">{escrow.title ?? "Transaction details"}</h1>
                  {escrow.description ? <p className="mt-2 max-w-3xl text-slate-600">{escrow.description}</p> : null}
                </div>
                <p className="text-2xl font-bold">{escrow.amount}</p>
              </div>
              <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-sm text-slate-500">Lifecycle</dt><dd className="mt-1 font-bold capitalize">{label(escrow.lifecycleStatus)}</dd></div>
                <div><dt className="text-sm text-slate-500">Funding</dt><dd className="mt-1 font-bold capitalize">{label(escrow.fundingStatus)}</dd></div>
                <div><dt className="text-sm text-slate-500">Created</dt><dd className="mt-1 font-bold">{date(escrow.createdAt)}</dd></div>
                <div><dt className="text-sm text-slate-500">Next step</dt><dd className="mt-1 font-bold">{escrow.due}</dd></div>
              </dl>
            </header>

            <section className="mt-6 grid gap-6 md:grid-cols-2">
              {[{ heading: "Buyer", party: escrow.buyer }, { heading: "Seller", party: escrow.seller }].map(({ heading, party }) => (
                <article key={heading} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-bold">{heading}</h2>
                  <p className="mt-3 font-bold">{party?.name ?? "Pending"}</p>
                  <p className="mt-1 text-slate-600">{party?.email ?? "No account linked"}</p>
                  {party?.partyType ? <p className="mt-2 text-sm capitalize text-slate-500">{party.partyType}</p> : null}
                </article>
              ))}
            </section>

            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">Agreement</h2>
              {escrow.agreement ? (
                <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div><dt className="text-sm text-slate-500">Version</dt><dd className="mt-1 font-bold">{escrow.agreement.version}</dd></div>
                  <div><dt className="text-sm text-slate-500">Status</dt><dd className="mt-1 font-bold capitalize">{label(escrow.agreement.status)}</dd></div>
                  <div><dt className="text-sm text-slate-500">Creator signature</dt><dd className="mt-1 font-bold">{escrow.agreement.creatorSigned ? "Signed" : "Pending"}</dd></div>
                  <div><dt className="text-sm text-slate-500">Counterparty signature</dt><dd className="mt-1 font-bold">{escrow.agreement.counterpartySigned ? "Signed" : "Pending"}</dd></div>
                </dl>
              ) : <p className="mt-4 text-slate-600">No agreement version has been recorded.</p>}
            </section>

            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">Milestones</h2>
              {escrow.milestones?.length ? (
                <div className="mt-4 space-y-3">
                  {escrow.milestones.map((milestone) => (
                    <article key={milestone.id} className="rounded-xl bg-slate-50 p-4">
                      <div className="flex flex-wrap justify-between gap-3">
                        <div><p className="font-bold">{milestone.title}</p><p className="mt-1 text-sm capitalize text-slate-600">{label(milestone.status)}</p></div>
                        <p className="font-bold">{milestone.amount}</p>
                      </div>
                      {milestone.description ? <p className="mt-2 text-sm text-slate-600">{milestone.description}</p> : null}
                      {milestone.deadline ? <p className="mt-2 text-xs text-slate-500">Due {date(milestone.deadline)}</p> : null}
                    </article>
                  ))}
                </div>
              ) : <p className="mt-4 text-slate-600">No milestones were specified for this agreement.</p>}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
