import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  agreementIdentityText,
  agreementMilestone,
  arbitrationReportIntegritySha256,
  buildArbitrationReportPdf,
  MAX_ARBITRATION_EXHIBIT_BYTES,
  reportFileReference,
  type ArbitrationReport,
} from "@/lib/arbitrationReport";

const exhibitBytes = new TextEncoder().encode("Deterministic arbitration exhibit.\n");
const exhibitSha256 = createHash("sha256").update(exhibitBytes).digest("hex");
const browserCrypto = globalThis.crypto;
const deterministicCrypto = {
  subtle: {
    digest: async (_algorithm: AlgorithmIdentifier, data: BufferSource) => {
      const bytes = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array(data);
      return Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer;
    },
  },
} as unknown as Crypto;

beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: deterministicCrypto,
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: browserCrypto,
  });
});

const arbitrationReport = (sha256 = exhibitSha256): ArbitrationReport => ({
  reportVersion: 2,
  reportId: "arbitration-report-DSP-TEST-001",
  generatedAt: "2026-07-29T12:00:00.000Z",
  integritySha256: "a".repeat(64),
  case: {
    reference: "DSP-TEST-001",
    title: "Test arbitration",
    status: "arbitration_requested",
    priority: "standard",
    reason: "The delivered work is disputed.",
    amountFrozenCents: 10_000,
    currency: "USD",
    openedAt: "2026-07-28T12:00:00.000Z",
    arbitrationRequestedAt: "2026-07-29T10:00:00.000Z",
    requestedRelief: "Release the disputed funds to the prevailing party.",
  },
  escrow: {
    reference: "ESC-TEST-001",
    title: "Test escrow",
    lifecycleStatus: "in_dispute",
    fundingStatus: "funded",
    amountCents: 10_000,
    createdAt: "2026-07-01T12:00:00.000Z",
  },
  parties: [],
  agreement: {
    id: 1,
    versionNumber: 1,
    status: "locked",
    termsHash: "b".repeat(64),
    title: "Test agreement",
    amountCents: 10_000,
    currency: "USD",
    creatorRole: "buyer",
    creatorParty: {},
    counterpartyParty: {},
    milestones: [],
    createdAt: "2026-07-01T12:00:00.000Z",
    createdBy: {
      id: "buyer-1",
      name: "Buyer",
      email: "buyer@example.test",
    },
    signatures: [],
  },
  disputedMilestone: null,
  evidence: [],
  exhibits: [{
    id: "milestone-evidence-1",
    source: "milestone_submission",
    sourceSubmissionId: 1,
    sourceSubmissionNumber: 1,
    context: "Milestone submission 1",
    fileName: "supporting-note.txt",
    contentType: "text/plain",
    sizeBytes: exhibitBytes.byteLength,
    sha256,
    submittedAt: "2026-07-27T12:00:00.000Z",
    submittedBy: {
      id: "seller-1",
      name: "Seller",
      email: "seller@example.test",
    },
    createdAt: "2026-07-27T12:00:00.000Z",
  }],
  chatLog: [],
  financialLedger: [],
  timeline: [],
  limitations: [],
});

const verifiedArbitrationReport = async (sha256 = exhibitSha256) => {
  const report = arbitrationReport(sha256);
  report.integritySha256 = await arbitrationReportIntegritySha256(report);
  return report;
};

describe("arbitration report formatting", () => {
  it("preserves agreement party identity details", () => {
    expect(agreementIdentityText({
      type: "business",
      legalName: "Northwind Studio Inc.",
      email: "legal@northwind.example",
      business: {
        representativeTitle: "Director",
        registrationCountry: "Canada",
        registrationNumber: "CA-1234",
      },
    })).toContain("Northwind Studio Inc.");
    expect(agreementIdentityText({
      type: "business",
      business: { registrationNumber: "CA-1234" },
    })).toContain("CA-1234");
  });

  it("normalizes agreement milestones and evidence file manifests", () => {
    expect(agreementMilestone({
      title: "Final delivery",
      description: "Provide the accepted files.",
      amountCents: 75_000,
      deadline: "2026-09-01T00:00:00.000Z",
    }, 0)).toEqual({
      title: "Final delivery",
      description: "Provide the accepted files.",
      amountCents: 75_000,
      deadline: "2026-09-01T00:00:00.000Z",
    });
    expect(reportFileReference({
      fileName: "delivery.zip",
      contentType: "application/zip",
      sizeBytes: 1024,
      sha256: "abc123",
    })).toEqual({
      fileName: "delivery.zip",
      contentType: "application/zip",
      sizeBytes: 1024,
      sha256: "abc123",
    });
  });
});

describe("arbitration report PDF exhibits", () => {
  it("embeds the verified original evidence file as a PDF attachment", async () => {
    const pdf = await buildArbitrationReportPdf(
      await verifiedArbitrationReport(),
      async () => exhibitBytes,
    );
    const pdfText = new TextDecoder("latin1").decode(pdf);

    expect(pdfText.startsWith("%PDF-")).toBe(true);
    expect(pdfText).toContain("/EmbeddedFiles");
    expect(pdfText).toContain("Exhibit-001-supporting-note.txt");
  });

  it("rejects an exhibit whose SHA-256 does not match the report", async () => {
    await expect(buildArbitrationReportPdf(
      await verifiedArbitrationReport("0".repeat(64)),
      async () => exhibitBytes,
    )).rejects.toThrow("SHA-256 integrity verification failed");
  });

  it("rejects an exhibit whose byte length does not match the report", async () => {
    const truncatedBytes = exhibitBytes.subarray(0, exhibitBytes.byteLength - 1);

    await expect(buildArbitrationReportPdf(
      await verifiedArbitrationReport(),
      async () => truncatedBytes,
    )).rejects.toThrow(
      `expected ${exhibitBytes.byteLength} bytes but received ${truncatedBytes.byteLength}`,
    );
  });

  it("rejects a packet whose declared exhibits exceed the aggregate memory limit", async () => {
    const report = await verifiedArbitrationReport();
    report.exhibits[0]!.sizeBytes = MAX_ARBITRATION_EXHIBIT_BYTES + 1;
    report.integritySha256 = await arbitrationReportIntegritySha256(report);

    await expect(buildArbitrationReportPdf(
      report,
      async () => exhibitBytes,
    )).rejects.toThrow("exceeding the 100 MB arbitration packet limit");
  });

  it("rejects a report whose canonical data hash has been altered", async () => {
    const report = await verifiedArbitrationReport();
    report.case.reason = "Tampered after the API response was signed.";

    await expect(buildArbitrationReportPdf(
      report,
      async () => exhibitBytes,
    )).rejects.toThrow("canonical SHA-256 integrity check");
  });
});
