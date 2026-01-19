"use client";

import { useEscrowSummary } from "@/hooks/useDashboardData";

export function OverviewSection() {
  const { data, isLoading, isError } = useEscrowSummary();

  if (isLoading) {
    return (
      <div className="grid gap-4">
        <div className="summary-grid">
          {Array.from({ length: 4 }).map((_, idx) => (
            <article
              key={`overview-loading-${idx}`}
              className="glass-card animate-pulse"
            >
              <div className="h-4 w-1/2 rounded bg-slate-100" />
              <div className="h-8 w-3/4 rounded bg-slate-100" />
              <div className="h-4 w-1/3 rounded bg-slate-100" />
            </article>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
          <div className="glass-card h-64 animate-pulse" />
          <div className="glass-card h-64 animate-pulse" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="glass-card">
        <p className="text-sm font-semibold text-[#1f1b42]">
          Unable to load dashboard overview.
        </p>
        <p className="text-sm text-slate-500">
          Please refresh or check your connection.
        </p>
      </div>
    );
  }

  const { summaryMetrics, activeEscrows, timelineEvents } = data;

  return (
    <>
      <div className="summary-grid">
        {summaryMetrics.map((metric) => (
          <article className="glass-card" key={metric.id}>
            <p className="card-title">{metric.label}</p>
            <strong className="card-value">{metric.value}</strong>
            <span className="card-meta">{metric.meta}</span>
          </article>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <section className="glass-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-[#1f1b42]">
              Active escrows
            </h3>
            <span className="pill pill--success">All reconciled</span>
          </div>

          <div className="escrow-list mt-4 overflow-auto">
            <div className="escrow-row min-w-[640px] text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span>Escrow</span>
              <span>Counterparty</span>
              <span>Amount</span>
              <span>Status</span>
              <span>Next step</span>
              <span>Due</span>
            </div>

            {activeEscrows.map((escrow) => (
              <div
                className="escrow-row min-w-[640px] rounded-xl bg-white/80 p-3 shadow-sm"
                key={escrow.id}
              >
                <div className="font-semibold text-[#1f1b42]">{escrow.id}</div>
                <div>{escrow.counterpart}</div>
                <div className="font-semibold">{escrow.amount}</div>
                <div>
                  <span
                    className={`pill ${
                      escrow.status === "warning" ? "pill--warning" : "pill--success"
                    }`}
                  >
                    {escrow.status === "warning" ? "Action needed" : "On track"}
                  </span>
                </div>
                <div>{escrow.stage}</div>
                <div className="text-sm text-slate-500">{escrow.due}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-card">
          <h3 className="text-lg font-semibold text-[#1f1b42]">
            Milestone timeline
          </h3>
          <div className="timeline mt-4">
            {timelineEvents.map((event) => (
              <div className="timeline-row" key={event.id}>
                <span className={`timeline-dot timeline-dot--${event.status}`} />
                <div className="timeline-copy">
                  <strong>{event.title}</strong>
                  <span>{event.meta}</span>
                  <p className="mt-1 text-sm text-slate-500">{event.time}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
