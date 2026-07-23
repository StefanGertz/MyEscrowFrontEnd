"use client";

import {
  useDisputes,
  useLaunchDisputeWorkspace,
} from "@/hooks/useDashboardData";
import { useToast } from "@/components/ToastProvider";

export function DisputesSection() {
  const { data, isLoading, isError } = useDisputes();
  const launchWorkspace = useLaunchDisputeWorkspace();
  const { pushToast } = useToast();

  const handleLaunch = async (disputeId: string) => {
    try {
      await launchWorkspace.mutateAsync({ disputeId });
      pushToast({
        variant: "success",
        title: `Workspace launched for ${disputeId}.`,
      });
    } catch (error) {
      pushToast({
        variant: "error",
        title: error instanceof Error ? error.message : "Unable to launch workspace.",
      });
    }
  };

  if (isLoading) {
    return <DisputeShell className="animate-pulse" />;
  }

  if (isError || !data) {
    return (
      <div className="glass-card">
        <p className="text-sm font-semibold text-[var(--brand-600)]">
          Unable to load disputes.
        </p>
        <p className="text-sm text-slate-500">
          Refresh to retry or contact support if the problem persists.
        </p>
      </div>
    );
  }

  const { disputes: disputeTickets } = data;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr,1fr]">
      <section className="glass-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-[var(--brand-600)]">
            Open disputes
          </h3>
          <span className="pill pill--warning">{disputeTickets.length} active</span>
        </div>

        <div className="mt-4 space-y-3">
          {disputeTickets.map((ticket) => {
            const isPending =
              launchWorkspace.isPending &&
              launchWorkspace.variables?.disputeId === ticket.id;
            const isSuccess =
              launchWorkspace.isSuccess &&
              launchWorkspace.data?.disputeId === ticket.id;
            return (
              <article
                key={ticket.id}
                className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--accent-cyan)]">
                      {ticket.id}
                    </p>
                    <p className="text-base font-semibold text-[var(--brand-600)]">
                      {ticket.title}
                    </p>
                  </div>
                  <span className="pill pill--warning">{ticket.amount}</span>
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  <p>{ticket.owner}</p>
                  <p>{ticket.updated}</p>
                  <p className="mt-1 font-semibold text-slate-600">
                    {ticket.status === "resolution_proposed"
                      ? "Complete allocation proposal awaiting acceptance"
                      : "Evidence and resolution workspace open"}
                  </p>
                </div>
                <button
                  className="primary-btn mt-3 w-full justify-center"
                  type="button"
                  disabled={isPending}
                  onClick={() => handleLaunch(ticket.id)}
                >
                  {isPending ? "Launching..." : "Open dispute workspace"}
                </button>
                {isSuccess ? (
                  <p className="mt-1 text-xs font-semibold text-emerald-600">
                    Workspace launched
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="glass-card">
        <h3 className="text-lg font-semibold text-[var(--brand-600)]">
          Response playbook
        </h3>
        <p className="mt-2 text-sm text-slate-500">
          Keep buyers and sellers aligned by tracking evidence, legal notes, and
          deadlines in one place.
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-600">
          <li>Assign an operations owner within 1 hour.</li>
          <li>Collect documentation + KYC re-check if balance &gt; $25k.</li>
          <li>Schedule video review with both parties within 2 days.</li>
        </ul>
        <button
          className="primary-btn mt-6 w-full justify-center"
          type="button"
          onClick={() => {
            if (disputeTickets[0]) {
              void handleLaunch(disputeTickets[0].id);
            }
          }}
          disabled={launchWorkspace.isPending}
        >
          {launchWorkspace.isPending ? "Launching..." : "Launch dispute workspace"}
        </button>
      </section>
    </div>
  );
}

function DisputeShell({ className = "" }: { className?: string }) {
  return (
    <div className={`glass-card ${className}`} style={{ minHeight: 220 }}>
      <div className="h-6 w-44 rounded bg-slate-100" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 2 }).map((_, idx) => (
          <div
            key={`dispute-skeleton-${idx}`}
            className="h-16 rounded-2xl bg-slate-100/80"
          />
        ))}
      </div>
    </div>
  );
}
