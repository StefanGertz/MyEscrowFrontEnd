import { jsPDF } from "jspdf";
import {
  PageSizes,
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
} from "pdf-lib";

export type ArbitrationReport = {
  reportVersion: number;
  reportId: string;
  generatedAt: string;
  integritySha256: string;
  case: {
    reference: string;
    title: string;
    status: string;
    priority: string;
    reason?: string | null;
    amountFrozenCents: number;
    currency: string;
    openedAt: string;
    evidenceWindowEndsAt?: string | null;
    arbitrationRequestedAt: string;
    resolvedAt?: string | null;
    openedBy?: ReportPerson | null;
    arbitrationRequestedBy?: ReportPerson | null;
    requestedRelief: string;
  };
  escrow: {
    reference: string;
    title: string;
    description?: string | null;
    lifecycleStatus: string;
    fundingStatus: string;
    fundingMode?: string | null;
    amountCents: number;
    createdAt: string;
    fundedAt?: string | null;
  };
  parties: Array<ReportPerson & {
    role: "buyer" | "seller";
    agreementIdentity: unknown;
  }>;
  agreement: {
    id: number;
    versionNumber: number;
    status: string;
    termsHash: string;
    title: string;
    description?: string | null;
    amountCents: number;
    currency: string;
    creatorRole: string;
    creatorParty: unknown;
    counterpartyParty: unknown;
    milestones: unknown[];
    createdAt: string;
    lockedAt?: string | null;
    createdBy: ReportPerson;
    signatures: Array<{
      id: number;
      signer: ReportPerson;
      signerRole: string;
      signedAt: string;
      evidenceHash: string;
      signatureDataUrl: string;
    }>;
  };
  disputedMilestone?: {
    id: number;
    title: string;
    description?: string | null;
    amountCents: number;
    deadline?: string | null;
    status: string;
    submissions: Array<{
      id: number;
      submissionNumber: number;
      note?: string | null;
      submittedAt: string;
      submitter: ReportPerson;
      evidence: Array<ReportFileReference & {
        id: number;
        exhibitId: string | null;
        storageStatus: "managed" | "metadata_only";
        createdAt: string;
      }>;
      review?: {
        decision: string;
        reason?: string | null;
        reviewedAt: string;
        reviewer: ReportPerson;
      } | null;
    }>;
  } | null;
  evidence: Array<{
    id: number;
    note?: string | null;
    references: ReportFileReference[];
    submittedAt: string;
    submitter: ReportPerson;
  }>;
  exhibits: ArbitrationExhibit[];
  chatLog: Array<{
    id: number;
    body: string;
    sentAt: string;
    sender: ReportPerson & { role: "buyer" | "seller" };
  }>;
  financialLedger: Array<{
    id: number;
    businessReference: string;
    movementType: string;
    amountCents: number;
    currency: string;
    sourceCommand: string;
    createdAt: string;
    actor: ReportPerson;
    milestone?: { id: number; title: string } | null;
  }>;
  timeline: Array<{
    at: string;
    type: string;
    action: string;
    description: string;
  }>;
  limitations: string[];
};

export type ReportPerson = {
  id: string;
  name: string;
  email: string;
};

export type ReportFileReference = {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  exhibitId?: string | null;
  storageStatus?: "managed" | "metadata_only";
};

export type ArbitrationExhibit = ReportFileReference & {
  id: string;
  source: "milestone_submission" | "dispute_evidence";
  sourceSubmissionId: number;
  sourceSubmissionNumber: number | null;
  context: string;
  submittedAt: string;
  submittedBy: ReportPerson;
  createdAt: string;
};

export type ArbitrationExhibitLoader = (
  exhibit: ArbitrationExhibit,
) => Promise<ArrayBuffer | Uint8Array>;

const date = (value?: string | null) => {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Not recorded"
    : parsed.toISOString();
};

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "code",
  }).format(cents / 100);

const integer = (value: number) => new Intl.NumberFormat("en-US").format(value);

const words = (value: string) => value.replaceAll("_", " ").replaceAll(".", " ");

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const valueText = (value: unknown) => typeof value === "string" ? value : "";

export function agreementIdentityText(value: unknown) {
  const identity = record(value);
  if (!identity) return "No additional agreement identity was recorded.";
  const business = record(identity.business);
  const identityType = valueText(identity.type);
  const items = [
    valueText(identity.legalName),
    valueText(identity.email),
    identityType === "business"
      ? "Business party"
      : identityType === "individual"
        ? "Individual party"
        : "",
    valueText(identity.representativeName),
    valueText(identity.representativeTitle),
    valueText(identity.registrationCountry),
    valueText(identity.registrationNumber),
    valueText(identity.registeredAddress),
    valueText(business?.legalName),
    valueText(business?.representativeTitle),
    valueText(business?.registrationCountry),
    valueText(business?.registrationNumber),
    valueText(business?.registeredAddress),
  ].filter(Boolean);
  return [...new Set(items)].join(" | ") || "No additional agreement identity was recorded.";
}

export function reportFileReference(value: unknown): ReportFileReference | null {
  const item = record(value);
  if (!item) return null;
  const fileName = valueText(item.fileName);
  const contentType = valueText(item.contentType);
  const sha = valueText(item.sha256);
  const sizeBytes = typeof item.sizeBytes === "number" ? item.sizeBytes : 0;
  const exhibitId = typeof item.exhibitId === "string" ? item.exhibitId : null;
  const storageStatus = item.storageStatus === "managed" || item.storageStatus === "metadata_only"
    ? item.storageStatus
    : undefined;
  if (!fileName && !sha) return null;
  return {
    fileName: fileName || "Unnamed file",
    contentType,
    sizeBytes,
    sha256: sha,
    ...(exhibitId ? { exhibitId } : {}),
    ...(storageStatus ? { storageStatus } : {}),
  };
}

export function agreementMilestone(value: unknown, index: number) {
  const item = record(value);
  return {
    title: valueText(item?.title) || `Milestone ${index + 1}`,
    description: valueText(item?.description),
    amountCents: typeof item?.amountCents === "number" ? item.amountCents : 0,
    deadline: valueText(item?.deadline),
  };
}

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "arbitration-report";

export const MAX_ARBITRATION_EXHIBIT_BYTES = 100_000_000;
export const MAX_ARBITRATION_EXHIBIT_FILES = 100;

const asBytes = (value: ArrayBuffer | Uint8Array) =>
  value instanceof Uint8Array ? value : new Uint8Array(value);

export async function sha256Hex(value: ArrayBuffer | Uint8Array) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("SHA-256 verification is unavailable in this browser.");
  }
  const bytes = Uint8Array.from(asBytes(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes.buffer);
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, "0")).join("");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export async function arbitrationReportIntegritySha256(report: ArbitrationReport) {
  const reportCore = Object.fromEntries(
    Object.entries(report).filter(([key]) =>
      key !== "generatedAt" && key !== "integritySha256"),
  );
  return sha256Hex(
    new TextEncoder().encode(JSON.stringify(canonicalize(reportCore))),
  );
}

function attachmentName(exhibit: ArbitrationExhibit, index: number) {
  const original = exhibit.fileName
    .split(/[\\/]/)
    .pop()
    ?.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["<>:|?*\u0000-\u001f]/g, "_")
    .trim()
    .slice(0, 150) || "evidence-file";
  return `Exhibit-${String(index + 1).padStart(3, "0")}-${original}`;
}

function wrapPdfLibText(font: PDFFont, text: string, size: number, maxWidth: number) {
  const output: string[] = [];
  const encodableText = text.replace(/[^\x20-\x7e\r\n]/g, "?");
  for (const paragraph of encodableText.split(/\r?\n/)) {
    const wordsInParagraph = paragraph.split(/\s+/).filter(Boolean);
    if (!wordsInParagraph.length) {
      output.push("");
      continue;
    }
    let current = "";
    for (const word of wordsInParagraph) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) output.push(current);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
        continue;
      }
      let chunk = "";
      for (const character of word) {
        const next = `${chunk}${character}`;
        if (chunk && font.widthOfTextAtSize(next, size) > maxWidth) {
          output.push(chunk);
          chunk = character;
        } else {
          chunk = next;
        }
      }
      current = chunk;
    }
    if (current) output.push(current);
  }
  return output;
}

function addExhibitCover(
  pdf: PDFDocument,
  font: PDFFont,
  boldFont: PDFFont,
  report: ArbitrationReport,
  exhibit: ArbitrationExhibit,
  index: number,
  embeddedName: string,
) {
  const page = pdf.addPage(PageSizes.A4);
  const { width, height } = page.getSize();
  const margin = 42;
  page.drawRectangle({
    x: 0,
    y: height - 92,
    width,
    height: 92,
    color: rgb(0.06, 0.3, 0.51),
  });
  page.drawText("MYESCROW ARBITRATION REPORT", {
    x: margin,
    y: height - 38,
    size: 11,
    font: boldFont,
    color: rgb(1, 1, 1),
  });
  page.drawText(`EXHIBIT ${String(index + 1).padStart(3, "0")}`, {
    x: margin,
    y: height - 68,
    size: 22,
    font: boldFont,
    color: rgb(1, 1, 1),
  });
  page.drawText(report.case.reference, {
    x: width - margin - font.widthOfTextAtSize(report.case.reference, 10),
    y: height - 62,
    size: 10,
    font,
    color: rgb(1, 1, 1),
  });

  let y = height - 128;
  const drawValue = (label: string, value: string, monospace = false) => {
    page.drawText(label.toUpperCase(), {
      x: margin,
      y,
      size: 8,
      font: boldFont,
      color: rgb(0.36, 0.43, 0.5),
    });
    y -= 16;
    const lines = wrapPdfLibText(monospace ? font : font, value || "Not recorded", 10, width - margin * 2);
    for (const lineText of lines) {
      page.drawText(lineText, {
        x: margin,
        y,
        size: 10,
        font,
        color: rgb(0.1, 0.15, 0.2),
      });
      y -= 14;
    }
    y -= 10;
  };

  drawValue("Original filename", exhibit.fileName);
  drawValue("Evidence context", exhibit.context);
  drawValue("Submitted", `${exhibit.submittedBy.name} · ${date(exhibit.submittedAt)}`);
  drawValue("File type and size", `${exhibit.contentType || "Unknown type"} · ${integer(exhibit.sizeBytes)} bytes`);
  drawValue("SHA-256", exhibit.sha256, true);
  drawValue("Embedded attachment name", embeddedName);

  const note = "The original file bytes are embedded in this PDF as an attachment. For safety, untrusted exhibit content is not parsed or imported into report pages. Use a PDF reader with an Attachments panel to extract and review the original in an appropriate application.";
  const noteLines = wrapPdfLibText(font, note, 9, width - margin * 2);
  page.drawRectangle({
    x: margin,
    y: Math.max(54, y - noteLines.length * 13 - 20),
    width: width - margin * 2,
    height: noteLines.length * 13 + 20,
    color: rgb(0.93, 0.98, 0.98),
  });
  let noteY = Math.max(69, y - 18);
  for (const lineText of noteLines) {
    page.drawText(lineText, {
      x: margin + 12,
      y: noteY,
      size: 9,
      font,
      color: rgb(0.07, 0.35, 0.35),
    });
    noteY -= 13;
  }
  page.drawText(
    `${report.reportId} | ${report.integritySha256.slice(0, 20)}...`,
    {
      x: margin,
      y: 20,
      size: 7,
      font,
      color: rgb(0.36, 0.43, 0.5),
    },
  );
  const coverLabel = `Exhibit ${String(index + 1).padStart(3, "0")} cover`;
  page.drawText(coverLabel, {
    x: width - margin - font.widthOfTextAtSize(coverLabel, 7),
    y: 20,
    size: 7,
    font,
    color: rgb(0.36, 0.43, 0.5),
  });
}

async function embedExhibits(
  basePdf: ArrayBuffer,
  report: ArbitrationReport,
  loadExhibit: ArbitrationExhibitLoader,
) {
  if (report.exhibits.length > MAX_ARBITRATION_EXHIBIT_FILES) {
    throw new Error(
      `The arbitration packet contains ${report.exhibits.length} exhibits, exceeding the 100-file packet limit.`,
    );
  }
  const totalSize = report.exhibits.reduce((total, exhibit) => total + exhibit.sizeBytes, 0);
  if (totalSize > MAX_ARBITRATION_EXHIBIT_BYTES) {
    throw new Error(
      `The ${report.exhibits.length} exhibits total ${integer(totalSize)} bytes, exceeding the 100 MB arbitration packet limit.`,
    );
  }
  const exhibitIds = new Set<string>();
  for (const exhibit of report.exhibits) {
    if (exhibitIds.has(exhibit.id)) {
      throw new Error(`The arbitration exhibit index contains duplicate ID ${exhibit.id}.`);
    }
    exhibitIds.add(exhibit.id);
  }

  const pdf = await PDFDocument.load(basePdf);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(`${report.case.reference} arbitration report`, { showInWindowTitleBar: true });
  pdf.setSubject("Confidential MyEscrow arbitration evidence packet with embedded original exhibits");
  pdf.setCreator("MyEscrow");
  pdf.setProducer("MyEscrow arbitration reporting");
  pdf.setKeywords(["arbitration", "escrow", "evidence", report.case.reference]);
  const generatedAt = new Date(report.generatedAt);
  const hasValidGeneratedAt = !Number.isNaN(generatedAt.getTime());
  if (hasValidGeneratedAt) {
    pdf.setCreationDate(generatedAt);
    pdf.setModificationDate(generatedAt);
  }
  const attachmentDates = hasValidGeneratedAt
    ? { creationDate: generatedAt, modificationDate: generatedAt }
    : {};

  await pdf.attach(
    new TextEncoder().encode(JSON.stringify(report, null, 2)),
    "Arbitration-Report-Data.json",
    {
      mimeType: "application/json",
      description: `Machine-readable arbitration report data; canonical SHA-256 ${report.integritySha256}`,
      ...attachmentDates,
    },
  );

  for (const [index, exhibit] of report.exhibits.entries()) {
    let loaded: ArrayBuffer | Uint8Array;
    try {
      loaded = await loadExhibit(exhibit);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "download failed";
      throw new Error(`Unable to embed ${exhibit.fileName}: ${detail}`);
    }
    const bytes = asBytes(loaded);
    if (bytes.byteLength !== exhibit.sizeBytes) {
      throw new Error(
        `Unable to embed ${exhibit.fileName}: expected ${exhibit.sizeBytes} bytes but received ${bytes.byteLength}.`,
      );
    }
    const actualHash = await sha256Hex(bytes);
    if (actualHash !== exhibit.sha256.toLowerCase()) {
      throw new Error(`Unable to embed ${exhibit.fileName}: SHA-256 integrity verification failed.`);
    }

    const embeddedName = attachmentName(exhibit, index);
    await pdf.attach(bytes, embeddedName, {
      mimeType: exhibit.contentType || "application/octet-stream",
      description: `${exhibit.context}; SHA-256 ${exhibit.sha256}`,
      ...attachmentDates,
    });
    addExhibitCover(pdf, font, boldFont, report, exhibit, index, embeddedName);
  }

  return pdf.save({ useObjectStreams: false });
}

export async function buildArbitrationReportPdf(
  report: ArbitrationReport,
  loadExhibit: ArbitrationExhibitLoader,
) {
  const actualReportHash = await arbitrationReportIntegritySha256(report);
  if (actualReportHash !== report.integritySha256.toLowerCase()) {
    throw new Error("The arbitration report failed its canonical SHA-256 integrity check.");
  }
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 17;
  const contentWidth = pageWidth - margin * 2;
  const navy = [15, 76, 129] as const;
  const teal = [30, 147, 145] as const;
  const ink = [26, 38, 52] as const;
  const muted = [92, 108, 124] as const;
  let y = 42;

  const pageHeader = () => {
    doc.setFillColor(...navy);
    doc.rect(0, 0, pageWidth, 27, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("MYESCROW", margin, 12);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("ARBITRATION REPORT", margin, 20);
    doc.text(report.case.reference, pageWidth - margin, 16, { align: "right" });
  };

  const newPage = () => {
    doc.addPage();
    pageHeader();
    y = 38;
  };

  const ensure = (height: number) => {
    if (y + height > pageHeight - 18) newPage();
  };

  const line = (
    text: string,
    options?: {
      bold?: boolean;
      size?: number;
      color?: readonly [number, number, number];
      indent?: number;
      spacing?: number;
    },
  ) => {
    const indent = options?.indent ?? 0;
    doc.setFont("helvetica", options?.bold ? "bold" : "normal");
    doc.setFontSize(options?.size ?? 9);
    doc.setTextColor(...(options?.color ?? ink));
    const lines = doc.splitTextToSize(text || "Not recorded", contentWidth - indent) as string[];
    for (const textLine of lines) {
      ensure(5);
      doc.text(textLine, margin + indent, y);
      y += options?.spacing ?? 4.5;
    }
    y += 1.5;
  };

  const section = (title: string) => {
    ensure(13);
    y += 3;
    doc.setDrawColor(...teal);
    doc.setLineWidth(0.7);
    doc.line(margin, y, margin + 7, y);
    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(title.toUpperCase(), margin + 10, y + 1);
    y += 8;
  };

  const item = (label: string, value: string) => {
    line(`${label}: ${value}`, { size: 8.5 });
  };

  pageHeader();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(21);
  doc.setTextColor(...ink);
  doc.text("Arbitration evidence packet", margin, y);
  y += 10;
  line(report.case.title, { bold: true, size: 14 });
  line("CONFIDENTIAL - Share only with the parties, their representatives, and the authorized arbitration administrator.", {
    bold: true,
    color: navy,
  });
  item("Report ID", report.reportId);
  item("Generated", date(report.generatedAt));
  item("Integrity SHA-256", report.integritySha256);

  section("Case summary");
  item("Dispute reference", report.case.reference);
  item("Escrow", `${report.escrow.title} (${report.escrow.reference})`);
  item("Status", words(report.case.status));
  item("Disputed amount", money(report.case.amountFrozenCents, report.case.currency));
  item("Opened", date(report.case.openedAt));
  item("Arbitration requested", date(report.case.arbitrationRequestedAt));
  item("Requested by", report.case.arbitrationRequestedBy?.name ?? "Not recorded");
  line(`Statement of facts: ${report.case.reason || "No separate dispute statement was recorded."}`);
  line(`Relief requested: ${report.case.requestedRelief}`);

  section("Parties");
  report.parties.forEach((party) => {
    line(`${party.role.toUpperCase()} - ${party.name}`, { bold: true });
    item("Email", party.email);
    line(agreementIdentityText(party.agreementIdentity), { color: muted, indent: 3 });
  });

  section("Operative agreement");
  item("Agreement", `${report.agreement.title} - version ${report.agreement.versionNumber}`);
  item("Agreement status", words(report.agreement.status));
  item("Agreement amount", money(report.agreement.amountCents, report.agreement.currency));
  item("Created", date(report.agreement.createdAt));
  item("Locked", date(report.agreement.lockedAt));
  item("Terms SHA-256", report.agreement.termsHash);
  line(report.agreement.description || "No additional agreement description was recorded.");
  line("Milestones", { bold: true });
  report.agreement.milestones.forEach((value, index) => {
    const milestone = agreementMilestone(value, index);
    line(
      `${index + 1}. ${milestone.title} - ${money(milestone.amountCents, report.agreement.currency)}${milestone.deadline ? ` - Due ${date(milestone.deadline)}` : ""}`,
      { bold: true, indent: 3 },
    );
    if (milestone.description) line(milestone.description, { indent: 6, color: muted });
  });

  line("Electronic signatures", { bold: true });
  report.agreement.signatures.forEach((signature) => {
    ensure(31);
    line(`${signature.signer.name} - ${words(signature.signerRole)}`, { bold: true, indent: 3 });
    item("Signed", date(signature.signedAt));
    item("Signature evidence SHA-256", signature.evidenceHash);
    if (signature.signatureDataUrl.startsWith("data:image/png;base64,")) {
      try {
        ensure(22);
        doc.addImage(signature.signatureDataUrl, "PNG", margin + 5, y, 62, 18, undefined, "FAST");
        y += 22;
      } catch {
        line("The signature image could not be embedded; its evidence hash is included above.", {
          color: muted,
          indent: 3,
        });
      }
    }
  });

  section("Disputed milestone and work record");
  if (!report.disputedMilestone) {
    line("No milestone is linked to this dispute.", { color: muted });
  } else {
    item("Milestone", report.disputedMilestone.title);
    item("Amount", money(report.disputedMilestone.amountCents, report.case.currency));
    item("Status", words(report.disputedMilestone.status));
    if (report.disputedMilestone.description) line(report.disputedMilestone.description);
    report.disputedMilestone.submissions.forEach((submission) => {
      line(
        `Submission ${submission.submissionNumber} by ${submission.submitter.name} - ${date(submission.submittedAt)}`,
        { bold: true, indent: 3 },
      );
      if (submission.note) line(submission.note, { indent: 6 });
      submission.evidence.forEach((file) => {
        line(`File: ${file.fileName} | ${file.contentType} | ${file.sizeBytes} bytes | SHA-256 ${file.sha256}`, {
          size: 7.5,
          indent: 6,
          color: muted,
        });
      });
      if (submission.review) {
        line(
          `Review: ${words(submission.review.decision)} by ${submission.review.reviewer.name} - ${date(submission.review.reviewedAt)}`,
          { indent: 6 },
        );
        if (submission.review.reason) line(submission.review.reason, { indent: 9, color: muted });
      }
    });
  }

  section("Formal dispute evidence");
  if (!report.evidence.length) {
    line("No formal dispute evidence submissions were recorded.", { color: muted });
  }
  report.evidence.forEach((submission) => {
    line(`Submission ${submission.id} by ${submission.submitter.name} - ${date(submission.submittedAt)}`, {
      bold: true,
    });
    if (submission.note) line(submission.note, { indent: 3 });
    submission.references.forEach((value) => {
      const file = reportFileReference(value);
      if (file) {
        line(`File: ${file.fileName} | ${file.contentType} | ${file.sizeBytes} bytes | SHA-256 ${file.sha256}`, {
          size: 7.5,
          indent: 3,
          color: muted,
        });
      }
    });
  });

  section("Embedded exhibit index");
  if (!report.exhibits.length) {
    line("No managed evidence files are available to embed.", { color: muted });
  }
  report.exhibits.forEach((exhibit, index) => {
    line(
      `Exhibit ${String(index + 1).padStart(3, "0")} | ${exhibit.fileName}`,
      { bold: true, size: 8.5 },
    );
    line(
      `${exhibit.context} | ${exhibit.contentType || "Unknown type"} | ${exhibit.sizeBytes} bytes | SHA-256 ${exhibit.sha256}`,
      { size: 7.5, indent: 3, color: muted },
    );
  });
  line(
    "Each indexed exhibit is embedded in the downloaded PDF as an original-file attachment. Exhibit content is not parsed or imported into report pages; each original follows a visible metadata cover.",
    { color: navy },
  );
  line(
    "Arbitration-Report-Data.json is also attached so names, messages, and other report text remain available in their exact Unicode form.",
    { color: navy },
  );

  section("Complete escrow chat transcript");
  if (!report.chatLog.length) line("No chat messages were recorded.", { color: muted });
  report.chatLog.forEach((message) => {
    line(
      `Message ${message.id} | ${message.sender.name} (${message.sender.role}) | ${date(message.sentAt)}`,
      { bold: true, size: 8.5 },
    );
    line(message.body, { indent: 3 });
  });

  section("Financial ledger");
  report.financialLedger.forEach((entry) => {
    line(
      `${date(entry.createdAt)} | ${words(entry.movementType)} | ${money(entry.amountCents, entry.currency)} | ${entry.businessReference}`,
      { size: 8.5 },
    );
  });

  section("Chronology");
  report.timeline.forEach((event) => {
    line(`${date(event.at)} | ${words(event.type)} | ${event.description}`, { size: 8.5 });
  });

  section("Integrity and scope notes");
  report.limitations.forEach((limitation) => line(`- ${limitation}`));

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...muted);
    doc.text(`${report.reportId} | ${report.integritySha256.slice(0, 20)}...`, margin, pageHeight - 8);
    doc.text(`Report page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  return embedExhibits(
    doc.output("arraybuffer"),
    report,
    loadExhibit,
  );
}

export async function downloadArbitrationReportPdf(
  report: ArbitrationReport,
  loadExhibit: ArbitrationExhibitLoader,
) {
  const bytes = await buildArbitrationReportPdf(report, loadExhibit);
  const objectUrl = URL.createObjectURL(
    new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }),
  );
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `${slug(report.case.reference)}-arbitration-report.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
