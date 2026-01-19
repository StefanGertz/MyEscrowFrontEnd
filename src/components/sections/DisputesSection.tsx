"use client";

import {
  useDisputes,
  useLaunchDisputeWorkspace,
  useResolveDispute,
} from "@/hooks/useDashboardData";

export function DisputesSection() {
  const { data, isLoading, isError } = useDisputes();
  const launchWorkspace = useLaunchDisputeWorkspace();
  const resolveDispute = useResolveDispute();

  if (isLoading) {
    return <DisputeShell className="animate-pulse" />;
  }

  if (isError || !data) {
    return (
      <div className="glass-card">
        <p className="text-sm font-semibold text-[#1f1b42]">
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
          <h3 className="text-lg font-semibold text-[#1f1b42]">
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
            const isResolving =
              resolveDispute.isPending &&
              resolveDispute.variables?.disputeId === ticket.id;
            const resolved =
              resolveDispute.isSuccess &&
              resolveDispute.data?.disputeId === ticket.id;

            return (
              <article
                key={ticket.id}
                className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#5a31ff]">
                      {ticket.id}
                    </p>
                    <p className="text-base font-semibold text-[#1f1b42]">
                      {ticket.title}
                    </p>
                  </div>
                  <span className="pill pill--warning">{ticket.amount}</span>
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  <p>{ticket.owner}</p>
                  <p>{ticket.updated}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    className="primary-btn mt-3 w-full justify-center"
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      launchWorkspace.mutate({ disputeId: ticket.id })
                    }
                  >
                    {isPending ? "Launching..." : "Launch dispute workspace"}
                  </button>
                  <button
                    className="ghost w-full justify-center"
                    type="button"
                    disabled={isResolving}
                    onClick={() =>
                      resolveDispute.mutate({ disputeId: ticket.id })
                    }
                  >
                    {isResolving ? "Resolving..." : "Resolve dispute"}
                  </button>
                </div>
                {isSuccess ? (
                  <p className="mt-1 text-xs font-semibold text-emerald-600">
                    Workspace launched
                  </p>
                ) : null}
                {resolved ? (
                  <p className="mt-1 text-xs font-semibold text-blue-600">
                    Dispute resolved
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="glass-card">
        <h3 className="text-lg font-semibold text-[#1f1b42]">
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
              launchWorkspace.mutate({ disputeId: disputeTickets[0].id });
            }
          }}
          disabled={launchWorkspace.isPending}
        >
          {launchWorkspace.isPending ? "Launching..." : "Launch dispute workspace"}
        </button>
        <button
          className="ghost mt-3 w-full justify-center"
          type="button"
          disabled={resolveDispute.isPending}
          onClick={() => {
            if (disputeTickets[0]) {
              resolveDispute.mutate({ disputeId: disputeTickets[0].id });
            }
          }}
        >
          {resolveDispute.isPending ? "Resolving..." : "Resolve dispute"}
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
