"use client";

import { useEscrows, useReleaseEscrow } from "@/hooks/useDashboardData";

export function EscrowsSection() {
  const { data, isLoading, isError } = useEscrows();
  const releaseEscrow = useReleaseEscrow();

  if (isLoading) {
    return <EscrowSectionShell className="animate-pulse" />;
  }

  if (isError || !data) {
    return (
      <div className="glass-card">
        <p className="text-sm font-semibold text-[#1f1b42]">
          Unable to load escrow tasks.
        </p>
        <p className="text-sm text-slate-500">
          Try reloading the app to fetch the latest items.
        </p>
      </div>
    );
  }

  const { escrows } = data;

  return (
    <section className="glass-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-[#1f1b42]">
          Escrows requiring review
        </h3>
        <span className="pill pill--warning">
          {escrows.filter((e) => e.status === "warning").length} with tasks
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Highlighting contracts with open actions, pending approvals, or balance
        replenishment.
      </p>

      <div className="escrow-list mt-4 overflow-auto">
        <div className="escrow-row min-w-[660px] text-xs font-semibold uppercase tracking-wide text-slate-400">
          <span>Escrow</span>
          <span>Counterparty</span>
          <span>Amount</span>
          <span>Milestone</span>
          <span>Step</span>
          <span>Owner</span>
        </div>

        {escrows.map((escrow) => (
          <div
            key={`${escrow.id}-review`}
            className="escrow-row min-w-[660px] rounded-xl bg-white/90 p-3 shadow-sm"
          >
            <div className="font-semibold text-[#1f1b42]">{escrow.id}</div>
            <div>{escrow.counterpart}</div>
            <div className="font-semibold">{escrow.amount}</div>
            <div>{escrow.stage}</div>
            <div className="text-sm text-slate-500">
              {escrow.due ?? "Task ready"}
            </div>
            <div className="flex flex-col gap-2">
              <span
                className={`pill ${
                  escrow.status === "warning" ? "pill--warning" : "pill--success"
                }`}
              >
                {escrow.status === "warning" ? "Needs review" : "Assigned"}
              </span>
              <button
                className="primary-btn !py-2 text-sm"
                type="button"
                disabled={releaseEscrow.isPending}
                onClick={() =>
                  releaseEscrow.mutate({ escrowId: escrow.id })
                }
              >
                {releaseEscrow.isPending ? "Releasing..." : "Release"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EscrowSectionShell({ className = "" }: { className?: string }) {
  return (
    <section className={`glass-card ${className}`}>
      <div className="h-6 w-48 rounded bg-slate-100" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div
            key={`escrow-skeleton-${idx}`}
            className="h-16 rounded-2xl bg-slate-100/80"
          />
        ))}
      </div>
    </section>
  );
}
