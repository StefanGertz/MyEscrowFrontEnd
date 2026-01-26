"use client";

import { useEscrows, useReleaseEscrow } from "@/hooks/useDashboardData";
import { useToast } from "@/components/ToastProvider";

export function EscrowsSection() {
  const { data, isLoading, isError } = useEscrows();
  const releaseEscrow = useReleaseEscrow();
  const { pushToast } = useToast();

  const handleRelease = async (escrowId: string, counterpartyApproved: boolean) => {
    if (!counterpartyApproved || releaseEscrow.isPending) return;
    try {
      await releaseEscrow.mutateAsync({ escrowId });
      pushToast({
        variant: "success",
        title: `Release queued for ${escrowId}.`,
      });
    } catch (error) {
      pushToast({
        variant: "error",
        title: error instanceof Error ? error.message : "Unable to release escrow.",
      });
    }
  };

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

        {escrows.map((escrow) => {
          const isRowProcessing =
            releaseEscrow.isPending &&
            releaseEscrow.variables?.escrowId === escrow.id;
          return (
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
                  disabled={
                    releaseEscrow.isPending || !escrow.counterpartyApproved
                  }
                  onClick={() =>
                    handleRelease(escrow.id, escrow.counterpartyApproved)
                  }
                >
                  {escrow.counterpartyApproved
                    ? isRowProcessing
                      ? "Releasing..."
                      : "Release"
                    : "Awaiting approval"}
                </button>
                {!escrow.counterpartyApproved ? (
                  <span className="text-xs text-slate-500">
                    Counterparty must approve the project before milestones can be
                    released.
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
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
