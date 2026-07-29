"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/apiClient";
import {
  agreementIdentityText,
  agreementMilestone,
  type ArbitrationReport,
  downloadArbitrationReportPdf,
  reportFileReference,
} from "@/lib/arbitrationReport";

type ArbitrationReportScreenProps = {
  endpoint: string;
  loginHref: string;
  backHref: string;
  backLabel: string;
  accessLabel: string;
};

const date = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "Not recorded";

const money = (value: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value / 100);

const label = (value: string) => value.replaceAll("_", " ").replaceAll(".", " ");

function Section({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:break-inside-auto print:shadow-none">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
        </div>
        {typeof count === "number" ? (
          <p className="text-sm font-bold text-slate-500">{count.toLocaleString()} record(s)</p>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FileManifest({ values }: { values: unknown[] }) {
  const files = values.map(reportFileReference).filter((file) => file !== null);
  if (!files.length) return null;
  return (
    <ul className="mt-3 space-y-2">
      {files.map((file, index) => (
        <li key={`${file.sha256}-${index}`} className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <p className="font-bold text-slate-800">{file.fileName}</p>
          <p>{file.contentType || "Unknown type"} · {file.sizeBytes.toLocaleString()} bytes</p>
          <p className="mt-1 break-all font-mono">SHA-256: {file.sha256 || "Not recorded"}</p>
          {file.storageStatus ? (
            <p className={`mt-2 font-bold ${
              file.storageStatus === "managed" ? "text-teal-700" : "text-amber-700"
            }`}>
              {file.storageStatus === "managed"
                ? "Managed original · verified and embedded during PDF download"
                : "Metadata-only legacy reference · original unavailable for embedding"}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ReportDocument({ report, accessLabel }: { report: ArbitrationReport; accessLabel: string }) {
  return (
    <article>
      <header className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:mt-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-teal-700">
              {accessLabel}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">Arbitration evidence packet</h1>
            <p className="mt-2 text-slate-600">{report.case.title} · {report.case.reference}</p>
          </div>
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-right">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-900">Confidential</p>
            <p className="mt-1 text-sm text-amber-950">Authorized arbitration use only</p>
          </div>
        </div>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-sm text-slate-500">Report ID</dt>
            <dd className="mt-1 font-bold">{report.reportId}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Disputed amount</dt>
            <dd className="mt-1 font-bold">{money(report.case.amountFrozenCents, report.case.currency)}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Arbitration requested</dt>
            <dd className="mt-1 font-bold">{date(report.case.arbitrationRequestedAt)}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Generated</dt>
            <dd className="mt-1 font-bold">{date(report.generatedAt)}</dd>
          </div>
        </dl>
        <div className="mt-5 rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Report integrity SHA-256</p>
          <p className="mt-1 break-all font-mono text-xs text-slate-700">{report.integritySha256}</p>
        </div>
      </header>

      <Section title="Case summary" description="The claim facts and requested determination recorded by MyEscrow.">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-sm text-slate-500">Escrow</dt>
            <dd className="mt-1 font-bold">{report.escrow.title} · {report.escrow.reference}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Case status</dt>
            <dd className="mt-1 font-bold capitalize">{label(report.case.status)}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Requested by</dt>
            <dd className="mt-1 font-bold">{report.case.arbitrationRequestedBy?.name ?? "Not recorded"}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Dispute opened</dt>
            <dd className="mt-1 font-bold">{date(report.case.openedAt)}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Evidence deadline</dt>
            <dd className="mt-1 font-bold">{date(report.case.evidenceWindowEndsAt)}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Priority</dt>
            <dd className="mt-1 font-bold capitalize">{report.case.priority}</dd>
          </div>
        </dl>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-950">Statement of facts</p>
            <p className="mt-2 whitespace-pre-wrap text-amber-950">
              {report.case.reason || "No separate dispute statement was recorded."}
            </p>
          </div>
          <div className="rounded-xl bg-teal-50 p-4">
            <p className="text-sm font-bold text-teal-950">Requested relief</p>
            <p className="mt-2 text-teal-950">{report.case.requestedRelief}</p>
          </div>
        </div>
      </Section>

      <Section title="Parties" description="Buyer and seller identities captured with the operative agreement.">
        <div className="grid gap-4 md:grid-cols-2">
          {report.parties.map((party) => (
            <article key={party.id} className="rounded-xl bg-slate-50 p-4 print:break-inside-avoid">
              <p className="text-xs font-bold uppercase tracking-wide text-teal-700">{party.role}</p>
              <h3 className="mt-1 text-lg font-bold">{party.name}</h3>
              <p className="text-sm text-slate-600">{party.email}</p>
              <p className="mt-3 text-sm text-slate-700">{agreementIdentityText(party.agreementIdentity)}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Operative agreement" description="The locked agreement version and electronic signature record.">
        <div className="rounded-xl border border-slate-200 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold">{report.agreement.title}</h3>
              <p className="mt-1 text-sm text-slate-600">
                Version {report.agreement.versionNumber} · {label(report.agreement.status)} · locked {date(report.agreement.lockedAt)}
              </p>
            </div>
            <p className="text-xl font-bold">{money(report.agreement.amountCents, report.agreement.currency)}</p>
          </div>
          <p className="mt-4 whitespace-pre-wrap text-slate-700">
            {report.agreement.description || "No additional agreement description was recorded."}
          </p>
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Terms SHA-256</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-700">{report.agreement.termsHash}</p>
          </div>
          <h4 className="mt-5 font-bold">Milestones</h4>
          <ol className="mt-3 space-y-3">
            {report.agreement.milestones.map((value, index) => {
              const milestone = agreementMilestone(value, index);
              return (
                <li key={`${milestone.title}-${index}`} className="rounded-lg bg-slate-50 p-3 print:break-inside-avoid">
                  <div className="flex flex-wrap justify-between gap-3">
                    <p className="font-bold">{index + 1}. {milestone.title}</p>
                    <p className="font-bold">{money(milestone.amountCents, report.agreement.currency)}</p>
                  </div>
                  {milestone.description ? <p className="mt-1 text-sm text-slate-700">{milestone.description}</p> : null}
                  {milestone.deadline ? <p className="mt-1 text-xs text-slate-500">Due {date(milestone.deadline)}</p> : null}
                </li>
              );
            })}
          </ol>
          <h4 className="mt-5 font-bold">Electronic signatures</h4>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {report.agreement.signatures.map((signature) => (
              <article key={signature.id} className="rounded-lg border border-slate-200 p-4 print:break-inside-avoid">
                <p className="text-xs font-bold uppercase tracking-wide text-teal-700">{signature.signerRole}</p>
                <p className="mt-1 font-bold">{signature.signer.name}</p>
                <p className="text-sm text-slate-600">{signature.signer.email}</p>
                {signature.signatureDataUrl.startsWith("data:image/png;base64,") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="mt-3 h-16 max-w-full object-contain object-left" src={signature.signatureDataUrl} alt={`Electronic signature of ${signature.signer.name}`} />
                ) : null}
                <p className="mt-3 text-xs text-slate-500">Signed {date(signature.signedAt)}</p>
                <p className="mt-1 break-all font-mono text-[11px] text-slate-500">
                  Evidence SHA-256: {signature.evidenceHash}
                </p>
              </article>
            ))}
          </div>
        </div>
      </Section>

      <Section
        title="Disputed milestone and work record"
        description="The affected milestone, its submissions, reviews, and file-integrity manifest."
        count={report.disputedMilestone?.submissions.length ?? 0}
      >
        {report.disputedMilestone ? (
          <>
            <div className="flex flex-wrap justify-between gap-3 rounded-xl bg-slate-50 p-4">
              <div>
                <p className="font-bold">{report.disputedMilestone.title}</p>
                <p className="mt-1 text-sm capitalize text-slate-600">{label(report.disputedMilestone.status)}</p>
              </div>
              <p className="font-bold">{money(report.disputedMilestone.amountCents, report.case.currency)}</p>
            </div>
            <div className="mt-4 space-y-3">
              {report.disputedMilestone.submissions.map((submission) => (
                <article key={submission.id} className="rounded-xl border border-slate-200 p-4 print:break-inside-avoid">
                  <div className="flex flex-wrap justify-between gap-3">
                    <p className="font-bold">Submission {submission.submissionNumber} · {submission.submitter.name}</p>
                    <p className="text-sm text-slate-500">{date(submission.submittedAt)}</p>
                  </div>
                  {submission.note ? <p className="mt-2 whitespace-pre-wrap">{submission.note}</p> : null}
                  <FileManifest values={submission.evidence} />
                  {submission.review ? (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                      <p className="font-bold capitalize">{label(submission.review.decision)} by {submission.review.reviewer.name}</p>
                      {submission.review.reason ? <p className="mt-1">{submission.review.reason}</p> : null}
                      <p className="mt-1 text-xs text-slate-500">{date(submission.review.reviewedAt)}</p>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </>
        ) : <p className="text-slate-600">No milestone is linked to this dispute.</p>}
      </Section>

      <Section
        title="Formal dispute evidence"
        description="Evidence submitted through the dispute workflow. File hashes identify referenced exhibits."
        count={report.evidence.length}
      >
        {report.evidence.length ? (
          <div className="space-y-3">
            {report.evidence.map((submission) => (
              <article key={submission.id} className="rounded-xl bg-slate-50 p-4 print:break-inside-avoid">
                <div className="flex flex-wrap justify-between gap-3">
                  <p className="font-bold">{submission.submitter.name}</p>
                  <p className="text-sm text-slate-500">{date(submission.submittedAt)}</p>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-slate-700">{submission.note || "Evidence references submitted."}</p>
                <FileManifest values={submission.references} />
              </article>
            ))}
          </div>
        ) : <p className="text-slate-600">No formal dispute evidence submissions were recorded.</p>}
      </Section>

      <Section
        title="Embedded exhibit index"
        description="Original managed files included inside the downloadable PDF, in attachment order."
        count={report.exhibits.length}
      >
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Security notice: embedded originals are not malware-scanned. Treat every attachment as
          untrusted and open it only with appropriate endpoint protection in a patched application.
        </p>
        {report.exhibits.length ? (
          <ol className="space-y-3">
            {report.exhibits.map((exhibit, index) => (
              <li key={exhibit.id} className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 print:break-inside-avoid">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-teal-700">
                      Exhibit {String(index + 1).padStart(3, "0")}
                    </p>
                    <p className="mt-1 font-bold">{exhibit.fileName}</p>
                    <p className="mt-1 text-sm text-slate-600">{exhibit.context}</p>
                  </div>
                  <p className="text-xs font-bold text-teal-800">Verified during download</p>
                </div>
                <p className="mt-3 text-xs text-slate-600">
                  {exhibit.contentType || "Unknown type"} · {exhibit.sizeBytes.toLocaleString()} bytes · submitted by {exhibit.submittedBy.name} on {date(exhibit.submittedAt)}
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-slate-500">SHA-256: {exhibit.sha256}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-slate-600">No managed evidence files are available to embed in this report.</p>
        )}
      </Section>

      <Section
        title="Complete escrow chat transcript"
        description={`Every recorded buyer/seller message through ${date(report.generatedAt)}.`}
        count={report.chatLog.length}
      >
        {report.chatLog.length ? (
          <ol className="space-y-3">
            {report.chatLog.map((message) => (
              <li key={message.id} className="rounded-xl border border-slate-200 p-4 print:break-inside-avoid">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="font-bold">
                    {message.sender.name}
                    <span className="ml-2 text-xs font-bold uppercase tracking-wide text-teal-700">
                      {message.sender.role}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">Message #{message.id} · {date(message.sentAt)}</p>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-slate-800">{message.body}</p>
              </li>
            ))}
          </ol>
        ) : <p className="text-slate-600">No chat messages were recorded for this escrow.</p>}
      </Section>

      <Section title="Financial ledger" description="Immutable escrow movements relevant to the transaction." count={report.financialLedger.length}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Movement</th>
                <th className="px-2 py-2">Amount</th>
                <th className="px-2 py-2">Reference</th>
              </tr>
            </thead>
            <tbody>
              {report.financialLedger.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100 print:break-inside-avoid">
                  <td className="px-2 py-3">{date(entry.createdAt)}</td>
                  <td className="px-2 py-3 capitalize">{label(entry.movementType)}</td>
                  <td className="px-2 py-3 font-bold">{money(entry.amountCents, entry.currency)}</td>
                  <td className="px-2 py-3 font-mono text-xs">{entry.businessReference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Chronology" description="System-generated sequence of agreement, funding, work, dispute, and arbitration events." count={report.timeline.length}>
        <ol className="space-y-3">
          {report.timeline.map((event, index) => (
            <li key={`${event.at}-${event.type}-${index}`} className="grid gap-1 border-l-2 border-teal-200 pl-4 sm:grid-cols-[190px_1fr] print:break-inside-avoid">
              <p className="text-xs text-slate-500">{date(event.at)}</p>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-teal-700">{label(event.type)}</p>
                <p className="text-sm text-slate-700">{event.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Scope and limitations">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          {report.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
        </ul>
      </Section>
    </article>
  );
}

export function ArbitrationReportScreen({
  endpoint,
  loginHref,
  backHref,
  backLabel,
  accessLabel,
}: ArbitrationReportScreenProps) {
  const router = useRouter();
  const { isAuthenticated, isHydrating } = useAuth();
  const [report, setReport] = useState<ArbitrationReport | null>(null);
  const [error, setError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [isPreparingPdf, setIsPreparingPdf] = useState(false);

  useEffect(() => {
    if (isHydrating) return;
    if (!isAuthenticated) {
      router.replace(loginHref);
      return;
    }

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await apiFetch(endpoint, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load the arbitration report.");
        setReport(body as ArbitrationReport);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load the arbitration report.");
        }
      }
    })();
    return () => controller.abort();
  }, [endpoint, isAuthenticated, isHydrating, loginHref, router]);

  const handleDownloadPdf = async () => {
    if (!report || isPreparingPdf) return;
    setDownloadError("");
    setIsPreparingPdf(true);
    try {
      await downloadArbitrationReportPdf(report, async (exhibit) => {
        const response = await apiFetch(
          `/api/arbitration/disputes/${encodeURIComponent(report.case.reference)}/exhibits/${encodeURIComponent(exhibit.id)}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(payload?.error ?? `Exhibit download failed with status ${response.status}.`);
        }
        return response.arrayBuffer();
      });
    } catch (downloadFailure) {
      setDownloadError(
        downloadFailure instanceof Error
          ? downloadFailure.message
          : "Unable to prepare the arbitration PDF.",
      );
    } finally {
      setIsPreparingPdf(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href={backHref} className="text-sm font-bold text-teal-700 hover:underline">
            ← {backLabel}
          </Link>
          {report ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl border border-teal-700 px-4 py-2 text-sm font-bold text-teal-700 hover:bg-teal-50"
                onClick={() => window.print()}
              >
                Print
              </button>
              <button
                type="button"
                className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60"
                onClick={() => void handleDownloadPdf()}
                disabled={isPreparingPdf}
              >
                {isPreparingPdf
                  ? `Embedding ${report.exhibits.length} exhibit(s)...`
                  : `Download report with ${report.exhibits.length} exhibit(s) (PDF)`}
              </button>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">{error}</div>
        ) : null}
        {downloadError ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
            The PDF was not downloaded because the evidence packet could not be completed: {downloadError}
          </div>
        ) : null}
        {!report && !error ? <p className="mt-8 text-slate-600">Loading arbitration report...</p> : null}
        {report ? <ReportDocument report={report} accessLabel={accessLabel} /> : null}
      </div>
    </main>
  );
}
