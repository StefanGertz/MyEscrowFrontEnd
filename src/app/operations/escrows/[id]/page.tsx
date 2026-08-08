"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import { apiFetch } from "@/lib/apiClient";
import type { EscrowRecord } from "@/lib/mockDashboard";
import {
  informationRequestParties,
  informationRequestResponses,
} from "@/lib/cancellationReview";

const label = (value?: string) => value ? value.replaceAll("_", " ") : "Not recorded";
const date = (value?: string) => value ? new Date(value).toLocaleString() : "Not recorded";
const money = (cents = 0) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
}).format(cents / 100);

type AdministrativeAction =
  | "request_information"
  | "reject_ineligible"
  | "refer_to_dispute"
  | "execute_documented_full_refund";

type AuthorityType = "arbitration_award" | "court_order";
type InformationRecipient = "buyer" | "seller" | "both";
type ProceduralReasonCode =
  | "duplicate_request"
  | "request_withdrawn"
  | "wrong_workflow"
  | "notice_requirement_unmet"
  | "no_eligible_funded_scope";

export default function OperationsEscrowPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm } = useConfirmDialog();
  const { isAuthenticated, isHydrating } = useAuth();
  const [escrow, setEscrow] = useState<EscrowRecord | null>(null);
  const [currentRole, setCurrentRole] = useState<"support" | "admin" | null>(null);
  const [rationale, setRationale] = useState("");
  const [informationRecipient, setInformationRecipient] = useState<InformationRecipient>("both");
  const [selectedMilestoneId, setSelectedMilestoneId] = useState("");
  const [proceduralReasonCode, setProceduralReasonCode] = useState<ProceduralReasonCode>("duplicate_request");
  const [policyReference, setPolicyReference] = useState("");
  const [resumeUnselectedFunds, setResumeUnselectedFunds] = useState(false);
  const [authorityType, setAuthorityType] = useState<AuthorityType>("court_order");
  const [authorityReference, setAuthorityReference] = useState("");
  const [authorityEffectiveDate, setAuthorityEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [authorityDocumentSha256, setAuthorityDocumentSha256] = useState("");
  const [authorityVerified, setAuthorityVerified] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<AdministrativeAction | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadEscrow = useCallback(async (signal?: AbortSignal) => {
    const response = await apiFetch(`/api/operations/escrows/${encodeURIComponent(id)}`, {
      cache: "no-store",
      signal,
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to load escrow details.");
    setEscrow(body.escrow as EscrowRecord);
    setCurrentRole(body.currentRole as "support" | "admin");
    setSelectedMilestoneId((current) => current || String(
      (body.escrow as EscrowRecord).milestones?.find((milestone) =>
        !["released", "refunded", "settled", "cancelled", "disputed"].includes(milestone.status))?.id ?? "",
    ));
  }, [id]);

  useEffect(() => {
    if (isHydrating) return;
    if (!isAuthenticated) {
      router.replace("/operations/login");
      return;
    }

    const controller = new AbortController();
    void (async () => {
      try {
        await loadEscrow(controller.signal);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load escrow details.");
        }
      }
    })();
    return () => controller.abort();
  }, [isAuthenticated, isHydrating, loadEscrow, router]);

  const applyAdministrativeAction = async (action: AdministrativeAction) => {
    if (!escrow?.cancellation) return;
    try {
      setSubmittingAction(action);
      setError("");
      setNotice("");
      const payload = {
        action,
        rationale: rationale.trim(),
        ...(action === "request_information" ? { recipient: informationRecipient } : {}),
        ...(action === "reject_ineligible"
          ? {
              reasonCode: proceduralReasonCode,
              policyReference: policyReference.trim(),
            }
          : {}),
        ...(action === "refer_to_dispute"
          ? {
              scope: "milestone",
              milestoneId: Number(selectedMilestoneId),
              resumeUnselectedFunds,
            }
          : {}),
        ...(action === "execute_documented_full_refund"
          ? {
              authorityType,
              authorityReference: authorityReference.trim(),
              authorityEffectiveAt: `${authorityEffectiveDate}T00:00:00.000Z`,
              authorityDocumentSha256: authorityDocumentSha256.trim().toLowerCase(),
              authorizedRefundCents: Math.max(
                0,
                (escrow.balances?.heldCents ?? 0) - (escrow.balances?.disputedCents ?? 0),
              ),
              authorityVerified,
            }
          : {}),
      };
      const response = await apiFetch(
        `/api/operations/cancellations/${encodeURIComponent(escrow.cancellation.id)}/actions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": `administrative-cancellation-${escrow.cancellation.id}-${crypto.randomUUID()}`,
          },
          body: JSON.stringify(payload),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to record this administrative action.");
      setRationale("");
      setPolicyReference("");
      setResumeUnselectedFunds(false);
      setAuthorityReference("");
      setAuthorityDocumentSha256("");
      setAuthorityVerified(false);
      setNotice(action === "request_information"
        ? `Information requested from ${informationRecipient === "both" ? "both parties" : `the ${informationRecipient}`}. The funds remain held.`
        : action === "reject_ineligible"
          ? "Request closed as procedurally ineligible. No money moved."
          : action === "refer_to_dispute"
            ? `Formal dispute ${body.disputeId} opened. Operations did not decide the merits.`
            : `Final authority executed. ${money(body.refundedCents)} was refunded to the buyer.`);
      await loadEscrow();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to record this administrative action.");
    } finally {
      setSubmittingAction(null);
    }
  };

  const confirmAdministrativeAction = (action: AdministrativeAction) => {
    if (!escrow?.cancellation || !escrow.balances) return;
    const refundableCents = Math.max(0, escrow.balances.heldCents - escrow.balances.disputedCents);
    const copy = action === "request_information"
      ? {
          title: "Request administrative information?",
          body: `No money will move. The cancellation hold remains in place and ${informationRecipient === "both" ? "both parties will receive" : `the ${informationRecipient} will receive`} the request.`,
          label: "Request information",
        }
      : action === "reject_ineligible"
        ? {
            title: "Close as procedurally ineligible?",
            body: "No contractual merits will be decided and no money will move. The escrow will return to its funded workflow.",
            label: "Close as ineligible",
          }
        : action === "refer_to_dispute"
          ? {
              title: "Refer milestone to formal dispute?",
              body: "The selected milestone amount will be reserved for evidence, party settlement, or arbitration. Operations will not decide entitlement.",
              label: "Open formal dispute",
            }
          : {
              title: "Execute final-authority full refund?",
              body: `${money(refundableCents)} of held, undisputed funds will be returned to the buyer under the attested final authority. ${money(escrow.balances.disputedCents)} remains reserved.`,
              label: "Execute full refund",
            };
    confirm({
      title: copy.title,
      body: `${copy.body} This action and its rationale are audited.`,
      confirmLabel: copy.label,
      onConfirm: () => applyAdministrativeAction(action),
    });
  };

  const administrativeReviewOpen = Boolean(
    escrow?.cancellation
    && ["escalated", "information_requested", "information_received"].includes(escrow.cancellation.status),
  );
  const eligibleReferralMilestones = escrow?.milestones?.filter((milestone) =>
    milestone.fundingStatus === "funded"
    && !["released", "refunded", "settled", "cancelled", "disputed"].includes(milestone.status)) ?? [];
  const rationaleValid = rationale.trim().length >= 10;
  const refundableCents = Math.max(
    0,
    (escrow?.balances?.heldCents ?? 0) - (escrow?.balances?.disputedCents ?? 0),
  );

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <Link href="/operations" className="text-sm font-bold text-teal-700 hover:underline">← Back to operations</Link>

        {error ? <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">{error}</div> : null}
        {notice ? <div className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-teal-900">{notice}</div> : null}
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

            {escrow.cancellation ? (
              <section className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.16em] text-amber-800">Administrative cancellation review</p>
                    <h2 className="mt-1 text-xl font-bold text-amber-950">Cancellation and refunds</h2>
                  </div>
                  <span className="rounded-full bg-amber-200 px-3 py-1 text-sm font-bold capitalize text-amber-950">
                    {label(escrow.cancellation.status)}
                  </span>
                </div>
                <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div><dt className="text-sm text-amber-800">Path</dt><dd className="mt-1 font-bold capitalize">{label(escrow.cancellation.mode)} cancellation</dd></div>
                  <div><dt className="text-sm text-amber-800">Requested</dt><dd className="mt-1 font-bold">{date(escrow.cancellation.requestedAt)}</dd></div>
                </dl>
                <div className="mt-5 rounded-xl border border-amber-200 bg-white/70 p-4">
                  <p className="text-sm font-bold text-amber-900">Reason</p>
                  <p className="mt-1 text-slate-800">{escrow.cancellation.reason}</p>
                </div>
                {escrow.cancellation.mode === "unilateral" && administrativeReviewOpen ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-white/70 p-4 text-sm text-amber-950">
                    <p className="font-bold">Operations does not decide contractual entitlement.</p>
                    <p className="mt-1">This review verifies process and authority. Contested merits must enter the formal dispute workflow; money moves here only under documented authority.</p>
                  </div>
                ) : null}
                {escrow.cancellation.mode === "unilateral" && escrow.balances ? (
                  <dl className="mt-5 grid gap-3 rounded-xl border border-amber-200 bg-white/70 p-4 sm:grid-cols-3">
                    <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Held</dt><dd className="mt-1 font-bold">{money(escrow.balances.heldCents)}</dd></div>
                    <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Disputed reserve</dt><dd className="mt-1 font-bold">{money(escrow.balances.disputedCents)}</dd></div>
                    <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Undisputed held balance</dt><dd className="mt-1 font-bold">{money(Math.max(0, escrow.balances.heldCents - escrow.balances.disputedCents))}</dd></div>
                  </dl>
                ) : null}
                {escrow.cancellation.mode === "unilateral"
                  && administrativeReviewOpen
                  && currentRole === "admin" ? (
                    <div className="mt-5 rounded-xl border border-amber-300 bg-white p-4">
                      <label className="block">
                        <span className="text-sm font-bold text-slate-900">Administrative rationale or information request</span>
                        <textarea
                          className="mt-2 min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                          value={rationale}
                          minLength={10}
                          maxLength={2_000}
                          onChange={(event) => setRationale(event.target.value)}
                          placeholder="Record the procedural basis, requested information, or authority scope. Do not decide the contractual merits."
                        />
                      </label>
                      <p className="mt-1 text-xs text-slate-500">Required, minimum 10 characters. Every action is retained with the cancellation record and audit trail.</p>

                      <label className="mt-4 block max-w-md">
                        <span className="text-sm font-bold text-slate-900">Request information from</span>
                        <select
                          aria-label="Request information from"
                          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                          value={informationRecipient}
                          onChange={(event) => setInformationRecipient(event.target.value as InformationRecipient)}
                        >
                          <option value="both">Both buyer and seller</option>
                          <option value="buyer">Buyer only</option>
                          <option value="seller">Seller only</option>
                        </select>
                        <span className="mt-1 block text-xs text-slate-500">Each selected party’s response is tracked separately.</span>
                      </label>

                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 p-4">
                          <p className="text-sm font-bold text-slate-900">Procedural closure</p>
                          <label className="mt-3 block">
                            <span className="text-sm text-slate-700">Reason code</span>
                            <select
                              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                              value={proceduralReasonCode}
                              onChange={(event) => setProceduralReasonCode(event.target.value as ProceduralReasonCode)}
                            >
                              <option value="duplicate_request">Duplicate request</option>
                              <option value="request_withdrawn">Request withdrawn</option>
                              <option value="wrong_workflow">Wrong workflow</option>
                              <option value="notice_requirement_unmet">Notice requirement unmet</option>
                              <option value="no_eligible_funded_scope">No eligible funded scope</option>
                            </select>
                          </label>
                          <label className="mt-3 block">
                            <span className="text-sm text-slate-700">Policy reference</span>
                            <input
                              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                              value={policyReference}
                              maxLength={500}
                              onChange={(event) => setPolicyReference(event.target.value)}
                              placeholder="Policy section or procedure ID"
                            />
                          </label>
                        </div>

                        <div className="rounded-xl border border-slate-200 p-4">
                          <p className="text-sm font-bold text-slate-900">Milestone-only formal referral</p>
                          <label className="mt-3 block">
                            <span className="text-sm text-slate-700">Fully funded milestone</span>
                            <select
                              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                              value={selectedMilestoneId}
                              onChange={(event) => setSelectedMilestoneId(event.target.value)}
                            >
                              <option value="">Select a milestone</option>
                              {eligibleReferralMilestones.map((milestone) => (
                                <option key={milestone.id} value={milestone.id}>{milestone.title} · {milestone.amount}</option>
                              ))}
                            </select>
                          </label>
                          <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={resumeUnselectedFunds}
                              onChange={(event) => setResumeUnselectedFunds(event.target.checked)}
                            />
                            <span>I acknowledge that only this milestone is reserved and all unselected funds resume under the agreement.</span>
                          </label>
                        </div>
                      </div>

                      <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-4">
                        <p className="text-sm font-bold text-slate-900">Final-authority full refund</p>
                        <p className="mt-1 text-xs text-slate-600">Execution only: the final order or award must direct the exact {money(refundableCents)} full refund shown here.</p>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <label className="block">
                            <span className="text-sm text-slate-700">Authority type</span>
                            <select
                              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                              value={authorityType}
                              onChange={(event) => setAuthorityType(event.target.value as AuthorityType)}
                            >
                              <option value="court_order">Final court order</option>
                              <option value="arbitration_award">Final arbitration award</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-sm text-slate-700">Authority reference</span>
                            <input
                              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                              value={authorityReference}
                              maxLength={500}
                              onChange={(event) => setAuthorityReference(event.target.value)}
                              placeholder="Final award or order ID"
                            />
                          </label>
                          <label className="block">
                            <span className="text-sm text-slate-700">Effective date</span>
                            <input
                              type="date"
                              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                              value={authorityEffectiveDate}
                              max={new Date().toISOString().slice(0, 10)}
                              onChange={(event) => setAuthorityEffectiveDate(event.target.value)}
                            />
                          </label>
                          <label className="block">
                            <span className="text-sm text-slate-700">Retained document SHA-256</span>
                            <input
                              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs"
                              value={authorityDocumentSha256}
                              maxLength={64}
                              onChange={(event) => setAuthorityDocumentSha256(event.target.value)}
                              placeholder="64 hexadecimal characters"
                            />
                          </label>
                        </div>
                        <label className="mt-3 flex items-start gap-2 text-sm font-bold text-slate-800">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={authorityVerified}
                            onChange={(event) => setAuthorityVerified(event.target.checked)}
                          />
                          <span>I attest that the retained document is final, effective, authentic, and authorizes this exact full refund.</span>
                        </label>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-3">
                        <button
                          type="button"
                          className="rounded-xl border border-sky-300 bg-sky-50 px-4 py-2 font-bold text-sky-900 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!rationaleValid || submittingAction !== null}
                          onClick={() => confirmAdministrativeAction("request_information")}
                        >
                          {submittingAction === "request_information" ? "Requesting…" : "Request information"}
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-rose-300 bg-white px-4 py-2 font-bold text-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!rationaleValid || policyReference.trim().length < 3 || submittingAction !== null}
                          onClick={() => confirmAdministrativeAction("reject_ineligible")}
                        >
                          {submittingAction === "reject_ineligible" ? "Closing…" : "Close as procedurally ineligible"}
                        </button>
                        <button
                          type="button"
                          className="rounded-xl bg-teal-700 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!rationaleValid || !selectedMilestoneId || !resumeUnselectedFunds || submittingAction !== null}
                          onClick={() => confirmAdministrativeAction("refer_to_dispute")}
                        >
                          {submittingAction === "refer_to_dispute" ? "Referring…" : "Refer milestone to formal dispute"}
                        </button>
                        <button
                          type="button"
                          className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={
                            !rationaleValid
                            || authorityReference.trim().length < 3
                            || !authorityEffectiveDate
                            || !/^[a-f0-9]{64}$/i.test(authorityDocumentSha256.trim())
                            || !authorityVerified
                            || refundableCents <= 0
                            || submittingAction !== null
                          }
                          onClick={() => confirmAdministrativeAction("execute_documented_full_refund")}
                        >
                          {submittingAction === "execute_documented_full_refund" ? "Executing…" : `Execute final-authority full refund ${money(refundableCents)}`}
                        </button>
                      </div>
                    </div>
                  ) : null}
                {escrow.cancellation.mode === "unilateral"
                  && administrativeReviewOpen
                  && currentRole === "support" ? (
                    <p className="mt-4 rounded-xl border border-amber-200 bg-white/70 p-4 text-sm text-amber-950">
                      Administrators record administrative actions. Support may inspect the request but cannot move money, reject it, or define the dispute scope.
                    </p>
                  ) : null}
                {escrow.cancellation.reviewMessages.length ? (
                  <div className="mt-5 rounded-xl border border-slate-200 bg-white/70 p-4">
                    <p className="text-sm font-bold text-slate-900">Administrative review history</p>
                    <div className="mt-3 space-y-3">
                      {escrow.cancellation.reviewMessages.map((message) => {
                        const responses = message.kind === "request_information"
                          ? informationRequestResponses(escrow.cancellation!.reviewMessages, message.id)
                          : [];
                        const expectedParties = informationRequestParties(message);
                        return (
                          <div key={message.id} className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                              <span className="font-bold capitalize">{message.author.name} · {label(message.kind)}</span>
                              <span>{date(message.createdAt)}</span>
                            </div>
                            {message.kind === "request_information" ? (
                              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                {expectedParties.map((party) => {
                                  const responded = responses.some((response) => response.respondingParty === party);
                                  return (
                                    <span
                                      key={party}
                                      className={`rounded-full px-2 py-1 font-bold capitalize ${responded ? "bg-teal-100 text-teal-800" : "bg-amber-100 text-amber-900"}`}
                                    >
                                      {party}: {responded ? "responded" : "awaiting response"}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : message.respondingParty ? (
                              <p className="mt-1 text-xs font-bold capitalize text-teal-700">{message.respondingParty} response</p>
                            ) : null}
                            <p className="mt-2 text-sm text-slate-800">{message.body}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {escrow.cancellation.reviewNote ? (
                  <div className="mt-5 rounded-xl border border-slate-200 bg-white/70 p-4">
                    <p className="text-sm font-bold text-slate-900">Latest administrative record</p>
                    <p className="mt-1 text-slate-700">{escrow.cancellation.reviewNote}</p>
                    {escrow.cancellation.administrativeAction ? <p className="mt-2 text-xs capitalize text-slate-500">Action: {label(escrow.cancellation.administrativeAction)}</p> : null}
                    {escrow.cancellation.proceduralReasonCode ? <p className="mt-1 text-xs text-slate-500">Procedural basis: {label(escrow.cancellation.proceduralReasonCode)} · {escrow.cancellation.policyReference}</p> : null}
                    {escrow.cancellation.authorityReference ? <p className="mt-1 text-xs text-slate-500">Authority: {label(escrow.cancellation.authorityType)} · {escrow.cancellation.authorityReference}</p> : null}
                    {escrow.cancellation.authorityEffectiveAt ? <p className="mt-1 text-xs text-slate-500">Effective: {date(escrow.cancellation.authorityEffectiveAt)} · SHA-256 {escrow.cancellation.authorityDocumentSha256}</p> : null}
                    {escrow.cancellation.lastReviewedAt ? <p className="mt-1 text-xs text-slate-500">Reviewed {date(escrow.cancellation.lastReviewedAt)}</p> : null}
                    {escrow.cancellation.respondedAt ? <p className="mt-1 text-xs text-slate-500">Closed {date(escrow.cancellation.respondedAt)}</p> : null}
                  </div>
                ) : null}
                {escrow.cancellation.referredDisputeReference ? (
                  <Link
                    href={`/operations/disputes/${encodeURIComponent(escrow.cancellation.referredDisputeReference)}`}
                    className="mt-4 inline-flex rounded-xl border border-teal-300 bg-white px-4 py-2 font-bold text-teal-800 hover:bg-teal-50"
                  >
                    Open formal dispute {escrow.cancellation.referredDisputeReference}
                  </Link>
                ) : null}
              </section>
            ) : null}

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
