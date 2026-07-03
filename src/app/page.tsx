"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import {
  useApproveEscrow,
  useApproveMilestone,
  useCancelEscrow,
  type CreateEscrowResponse,
  useCreateEscrow,
  useFundEscrow,
  useRejectEscrow,
  useRejectMilestone,
  useResubmitMilestone,
  useEscrowSummary,
  useEscrows,
  useNotifications,
  useWalletTopup,
  useWalletWithdraw,
} from "@/hooks/useDashboardData";
import { useToast } from "@/components/ToastProvider";
import { useAuth } from "@/components/AuthProvider";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import { jsPDF } from "jspdf";
import { LiveDashboard } from "@/components/LiveDashboard";
import { NotificationTimestamp } from "@/components/NotificationTimestamp";
import type { EscrowRecord } from "@/lib/mockDashboard";

type ScreenId =
  | "welcome"
  | "dashboard"
  | "create"
  | "milestones"
  | "agreement"
  | "wallet"
  | "history"
  | "escrows"
  | "settings"
  | "transaction";

type ProcessStep = {
  title: string;
  detail: string;
  status: "complete" | "active" | "upcoming";
};

type TxMilestone = {
  id: string;
  title: string;
  amount: number;
  description?: string;
  status: "pending" | "released" | "rejected";
  releasedAt?: string;
  rejectedAt?: string;
};

type TimelineEntry = {
  id: string;
  label: string;
  detail: string;
  time: string;
};

type Transaction = {
  id: number;
  reference?: string;
  title: string;
  description?: string;
  counterpart: string;
  amount: number;
  status: "Pending" | "Active" | "Complete" | "Resolved" | "Cancelled";
  context: string;
  lifecycleStatus?: string;
  fundingStatus?: string;
  creatorRole?: "buyer" | "seller";
  createdAt?: string;
  approvedAt?: string;
  buyerSignatureDataUrl?: string;
  sellerSignatureDataUrl?: string;
  userRole?: "buyer" | "seller";
  isOwner?: boolean;
  steps: ProcessStep[];
  buyer: string;
  buyerEmail: string;
  seller: string;
  sellerEmail: string;
  milestones: TxMilestone[];
  timeline: TimelineEntry[];
  counterpartyApproved: boolean;
};

type DraftMilestone = {
  id: string;
  title: string;
  amount: number;
  description: string;
};

type WalletHistoryEntry = {
  id: string;
  type: "deposit" | "withdraw";
  amount: number;
  date: string;
};

type ModalContent = {
  title: string;
  body: string;
};

type NotificationEntry = {
  id: string;
  label: string;
  detail: string;
  meta: string;
  createdAt?: string;
  txId?: number;
  requiresAction?: boolean;
};

type HomeProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const liveDashboardEnabled = (process.env.NEXT_PUBLIC_LIVE_DASHBOARD ?? "false") === "true";
const liveDataEnabled = (process.env.NEXT_PUBLIC_USE_MOCKS ?? "true") === "false";

const screenIds: ScreenId[] = [
  "welcome",
  "dashboard",
  "create",
  "milestones",
  "agreement",
  "wallet",
  "history",
  "escrows",
  "settings",
  "transaction",
];

const pickQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const isScreenId = (value: string | undefined): value is ScreenId =>
  value ? screenIds.includes(value as ScreenId) : false;

const normalizeTransactionToken = (value: string | number | undefined | null) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const digits = text.replace(/[^0-9]/g, "");
  return {
    raw: text,
    digits: digits ? String(Number(digits)) : null,
  };
};

const transactionMatchesToken = (tx: Transaction, value: string | number | undefined | null) => {
  const token = normalizeTransactionToken(value);
  if (!token) return false;
  if (String(tx.id) === token.raw) return true;
  if (tx.reference && tx.reference === token.raw) return true;
  const referenceDigits = tx.reference ? normalizeTransactionToken(tx.reference)?.digits : null;
  return Boolean(token.digits && referenceDigits && token.digits === referenceDigits);
};

const findTransactionByToken = (items: Transaction[], value: string | number | undefined | null) =>
  items.find((item) => transactionMatchesToken(item, value)) ?? null;

const defaultUser = {
  name: "Scott",
  email: "scott@example.com",
};

const roleFlowCopy = {
  buyer: {
    pill: "Buyer started escrow",
    label: "View buyer creation flow",
    steps: [
      "Buyer creates the escrow in the app.",
      "Seller receives an email invitation.",
      "Seller signs in and sees Approval pending.",
      "Seller reviews the agreement and accepts or rejects it.",
      "The buyer sees Funding pending and deposits the funds.",
    ],
  },
  seller: {
    pill: "Seller started escrow",
    label: "View seller creation flow",
    steps: [
      "Seller creates the escrow inside the app.",
      "Buyer receives an email and signs in.",
      "Buyer lands on the dashboard with Approval pending.",
      "Buyer reviews the escrow and accepts or rejects it.",
      "After approval, buyer returns to fund the escrow.",
    ],
  },
} as const;

const milestoneReleaseSteps = [
  "Seller opens an active escrow and submits the milestone for buyer review.",
  "The buyer receives an email and logs in to see Milestone pending.",
  "Buyer opens the escrow details from the alert.",
  "Buyer reviews the deliverable and approves the milestone.",
  "Funds immediately release to the seller's payout account.",
];

const createGuideSteps = [
  {
    title: "Invite the counterparty",
    detail: "We email your buyer or seller to accept the escrow and verify identity.",
  },
  {
    title: "Define payouts",
    detail: "Break the work into milestones so funds can release as soon as each stage completes.",
  },
  {
    title: "Sign and fund",
    detail: "Preview the agreement, capture signatures, and send the deposit from your wallet.",
  },
] as const;

const initialWalletHistory: WalletHistoryEntry[] = [
  { id: "wallet-h1", type: "deposit", amount: 250, date: new Date(Date.now() - 864e5 * 3).toISOString() },
  { id: "wallet-h2", type: "withdraw", amount: 50, date: new Date(Date.now() - 864e5 * 2).toISOString() },
  { id: "wallet-h3", type: "deposit", amount: 100, date: new Date(Date.now() - 864e5 * 1).toISOString() },
];

const initialTransactions: Transaction[] = [
  {
    id: 10106,
    title: "Wedding DJ",
    counterpart: "Acme DJ Corp",
    amount: 1600,
    status: "Pending",
    context: "Seller approval pending",
    steps: [
      { title: "Agreement drafted", detail: "Waiting for Acme DJ Corp", status: "active" },
      { title: "Deposit pending", detail: "Buyer funds after approval", status: "upcoming" },
      { title: "Performance day", detail: "Final payment after event", status: "upcoming" },
    ],
    buyer: defaultUser.name,
    buyerEmail: defaultUser.email,
    seller: "Acme DJ Corp",
    sellerEmail: "bookings@acmedj.com",
    milestones: [
      { id: "m10106a", title: "Wedding deposit", amount: 800, status: "pending", description: "Non-refundable date hold" },
      { id: "m10106b", title: "Wedding day performance", amount: 800, status: "pending", description: "Final set payment" },
    ],
    timeline: [
      { id: "tl-10106-a", label: "Created", detail: "Created by you (buyer)", time: new Date(Date.now() - 3600 * 1000 * 2).toISOString() },
      { id: "tl-10106-b", label: "Seller invited", detail: "Acme DJ Corp notified to review", time: new Date(Date.now() - 3600 * 1000 * 1.5).toISOString() },
    ],
    counterpartyApproved: false,
  },
  {
    id: 10107,
    title: "Restaurant tile install",
    counterpart: "Tiles R' Us",
    amount: 250000,
    status: "Active",
    context: "Milestones active",
    steps: [
      { title: "Agreement approved", detail: "Both sides signed", status: "complete" },
      { title: "Funded", detail: "Deposit secured", status: "complete" },
      { title: "Milestones active", detail: "Material + delivery pending", status: "active" },
    ],
    buyer: defaultUser.name,
    buyerEmail: defaultUser.email,
    seller: "Tiles R' Us",
    sellerEmail: "projects@tilesrus.com",
    milestones: [
      { id: "m10107a", title: "Deposit", amount: 50000, status: "released", releasedAt: new Date(Date.now() - 864e5 * 3).toISOString(), description: "Initial mobilisation payment" },
      { id: "m10107b", title: "Material acquisition", amount: 100000, status: "pending", description: "Order porcelain tile sets" },
      { id: "m10107c", title: "Delivery", amount: 100000, status: "pending", description: "Deliver tile to restaurant site" },
    ],
    timeline: [
      { id: "tl-10107-a", label: "Created", detail: "Created by you (buyer)", time: new Date(Date.now() - 864e5 * 7).toISOString() },
      { id: "tl-10107-b", label: "Seller approved", detail: "Tiles R' Us accepted terms", time: new Date(Date.now() - 864e5 * 6.5).toISOString() },
      { id: "tl-10107-c", label: "Funded", detail: "Deposit secured in escrow", time: new Date(Date.now() - 864e5 * 5).toISOString() },
      { id: "tl-10107-d", label: "Milestone released", detail: '"Deposit" milestone completed', time: new Date(Date.now() - 864e5 * 3).toISOString() },
    ],
    counterpartyApproved: true,
  },
  {
    id: 10105,
    title: "Northwind onboarding kit",
    counterpart: "Nora Studio",
    amount: 650,
    status: "Pending",
    context: "Approval pending",
    steps: [
      { title: "Agreement approved", detail: "Waiting for seller review", status: "active" },
      { title: "Funding pending", detail: "Buyer funds after approval", status: "upcoming" },
      { title: "Milestones active", detail: "Releases after delivery", status: "upcoming" },
    ],
    buyer: defaultUser.name,
    buyerEmail: defaultUser.email,
    seller: "Nora Studio",
    sellerEmail: "nora@example.com",
    milestones: [{ id: "m10105a", title: "Prototype delivery (Northwind)", amount: 650, status: "pending" }],
    timeline: [
      { id: "tl-10105-a", label: "Created", detail: "Created by you (buyer)", time: new Date(Date.now() - 3600 * 1000 * 6).toISOString() },
      { id: "tl-10105-b", label: "Seller notified", detail: "Nora Studio invited to approve", time: new Date(Date.now() - 3600 * 1000 * 5.5).toISOString() },
    ],
    counterpartyApproved: false,
  },
  {
    id: 10102,
    title: "Cloud Harbor retainer",
    counterpart: "Cloud Harbor",
    amount: 1200,
    status: "Active",
    context: "Milestones active",
    steps: [
      { title: "Agreement approved", detail: "Both sides signed", status: "complete" },
      { title: "Funded", detail: "Wallet balance secured", status: "complete" },
      { title: "Milestones active", detail: "4 / 6 completed", status: "active" },
    ],
    buyer: "John",
    buyerEmail: "john@example.com",
    seller: defaultUser.name,
    sellerEmail: defaultUser.email,
    milestones: [
      { id: "m10102a", title: "Design draft", amount: 400, status: "released", releasedAt: new Date(Date.now() - 864e5 * 1).toISOString() },
      { id: "m10102b", title: "Development sprint", amount: 400, status: "pending" },
      { id: "m10102c", title: "Final handoff", amount: 400, status: "pending" },
    ],
    timeline: [
      { id: "tl-10102-a", label: "Created", detail: "Created by you (seller)", time: new Date(Date.now() - 864e5 * 4).toISOString() },
      { id: "tl-10102-b", label: "Funded", detail: "Buyer funded escrow", time: new Date(Date.now() - 864e5 * 1.5).toISOString() },
      { id: "tl-10102-c", label: "Milestone released", detail: '"Design draft" released', time: new Date(Date.now() - 864e5 * 1).toISOString() },
    ],
    counterpartyApproved: true,
  },
  {
    id: 10103,
    title: "Summit Legal retainer",
    counterpart: "Summit Legal",
    amount: 300,
    status: "Complete",
    context: "All milestones paid",
    steps: [
      { title: "Agreement approved", detail: "Both sides signed", status: "complete" },
      { title: "Funded", detail: "Wallet balance secured", status: "complete" },
      { title: "Released", detail: "Final payout sent", status: "complete" },
    ],
    buyer: defaultUser.name,
    buyerEmail: defaultUser.email,
    seller: "Summit Legal",
    sellerEmail: "legal@summit.com",
    milestones: [
      { id: "m10103a", title: "Prototype submitted", amount: 150, status: "released", releasedAt: new Date(Date.now() - 864e5 * 4.5).toISOString() },
      { id: "m10103b", title: "Client approval", amount: 150, status: "released", releasedAt: new Date(Date.now() - 864e5 * 4).toISOString() },
    ],
    timeline: [
      { id: "tl-10103-a", label: "Created", detail: "Created by you (buyer)", time: new Date(Date.now() - 864e5 * 7).toISOString() },
      { id: "tl-10103-b", label: "Delivered", detail: "Milestones delivered", time: new Date(Date.now() - 864e5 * 5).toISOString() },
      { id: "tl-10103-c", label: "Closed", detail: "Escrow closed", time: new Date(Date.now() - 864e5 * 3.5).toISOString() },
    ],
    counterpartyApproved: true,
  },
];

const dashboardTimelineEntries = [
  {
    id: "dash-tl-1",
    label: "Restaurant tile install",
    detail: 'Review "Material acquisition" milestone - $100k pending',
    txId: 10107,
  },
  {
    id: "dash-tl-2",
    label: "Wedding DJ approval",
    detail: "Waiting for Acme DJ Corp to approve the escrow",
    txId: 10106,
  },
  {
    id: "dash-tl-3",
    label: "Northwind onboarding kit",
    detail: "Waiting for Nora Studio to approve before funding",
    txId: 10105,
  },
];

const bottomNav: Array<{ id: ScreenId; label: string }> = [
  { id: "welcome", label: "Home" },
  { id: "dashboard", label: "Dashboard" },
  { id: "create", label: "Create" },
  { id: "wallet", label: "Wallet" },
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

const formatHistoryDate = (value: string) =>
  new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const formatAgreementDate = (value?: string) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Date unavailable";

const randomId = () => Math.random().toString(36).slice(2, 9);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "agreement";

const parseCurrencyValue = (value: string) => {
  const numeric = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};

const sameEmail = (left?: string, right?: string) =>
  left?.trim().toLowerCase() === right?.trim().toLowerCase();

const downloadAgreementPdf = (tx: Transaction) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  const navy = [15, 76, 129] as const;
  const teal = [30, 147, 145] as const;
  const ink = [26, 38, 52] as const;
  const muted = [92, 108, 124] as const;
  const pale = [240, 246, 250] as const;
  let cursorY = 0;

  const addHeader = () => {
    doc.setFillColor(...navy);
    doc.rect(0, 0, pageWidth, 32, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("MYESCROW", margin, 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("ESCROW AGREEMENT", margin, 23);
    doc.text(tx.reference ?? `ME-${tx.id}`, pageWidth - margin, 19, { align: "right" });
    cursorY = 44;
  };

  const ensureSpace = (height: number) => {
    if (cursorY + height <= pageHeight - 20) return;
    doc.addPage();
    addHeader();
  };

  const sectionTitle = (title: string) => {
    ensureSpace(14);
    doc.setDrawColor(...teal);
    doc.setLineWidth(0.8);
    doc.line(margin, cursorY, margin + 6, cursorY);
    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(title.toUpperCase(), margin + 9, cursorY + 1);
    cursorY += 9;
  };

  const addWrappedText = (text: string, options?: { bold?: boolean; color?: readonly [number, number, number] }) => {
    doc.setFont("helvetica", options?.bold ? "bold" : "normal");
    doc.setFontSize(10);
    doc.setTextColor(...(options?.color ?? ink));
    const lines = doc.splitTextToSize(text, contentWidth) as string[];
    ensureSpace(lines.length * 5 + 2);
    doc.text(lines, margin, cursorY);
    cursorY += lines.length * 5 + 3;
  };

  addHeader();
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  const titleLines = doc.splitTextToSize(tx.title, contentWidth - 44) as string[];
  doc.text(titleLines, margin, cursorY);
  doc.setFillColor(...pale);
  doc.roundedRect(pageWidth - margin - 42, cursorY - 6, 42, 18, 2, 2, "F");
  doc.setTextColor(...navy);
  doc.setFontSize(13);
  doc.text(formatCurrency(tx.amount), pageWidth - margin - 4, cursorY + 5, { align: "right" });
  cursorY += Math.max(titleLines.length * 8, 21);

  doc.setFillColor(...pale);
  doc.roundedRect(margin, cursorY, contentWidth, 25, 2, 2, "F");
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "bold");
  doc.text("BUYER", margin + 5, cursorY + 7);
  doc.text("SELLER", margin + contentWidth / 2 + 4, cursorY + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...ink);
  doc.text(tx.buyer, margin + 5, cursorY + 14);
  doc.text(tx.seller, margin + contentWidth / 2 + 4, cursorY + 14);
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text(tx.buyerEmail, margin + 5, cursorY + 20);
  doc.text(tx.sellerEmail, margin + contentWidth / 2 + 4, cursorY + 20);
  cursorY += 36;

  sectionTitle("Agreement terms");
  addWrappedText(
    tx.description ||
      `The buyer and seller agree that ${formatCurrency(tx.amount)} will be held and released through MyEscrow according to the milestones below.`,
  );

  sectionTitle("Milestones");
  if (!tx.milestones.length) {
    addWrappedText("No separate milestones were specified for this agreement.", { color: muted });
  } else {
    tx.milestones.forEach((milestone, index) => {
      const descriptionLines = milestone.description
        ? (doc.splitTextToSize(milestone.description, contentWidth - 58) as string[])
        : [];
      const rowHeight = Math.max(15, 11 + descriptionLines.length * 4);
      ensureSpace(rowHeight + 2);
      doc.setFillColor(index % 2 === 0 ? 248 : 255, index % 2 === 0 ? 250 : 255, index % 2 === 0 ? 252 : 255);
      doc.roundedRect(margin, cursorY - 4, contentWidth, rowHeight, 1.5, 1.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...ink);
      doc.text(`${index + 1}. ${milestone.title}`, margin + 4, cursorY + 3);
      doc.text(formatCurrency(milestone.amount), pageWidth - margin - 4, cursorY + 3, { align: "right" });
      if (descriptionLines.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text(descriptionLines, margin + 9, cursorY + 9);
      }
      cursorY += rowHeight + 2;
    });
  }

  ensureSpace(60);
  sectionTitle("Signatures");
  const inferredCreatorRole =
    tx.creatorRole ?? (tx.timeline.find((event) => event.label === "Created")?.detail.includes("seller") ? "seller" : "buyer");
  const creatorSignedAt = tx.createdAt ?? tx.timeline.find((event) => event.label === "Created")?.time;
  const approvalEvent = tx.timeline.find((event) => /approved/i.test(event.label));
  const signerWidth = (contentWidth - 8) / 2;
  const signatureTop = cursorY;
  const renderSignature = (
    x: number,
    role: "Buyer" | "Seller",
    name: string,
    email: string,
    image: string | undefined,
    signed: boolean,
    signedAt: string | undefined,
  ) => {
    doc.setDrawColor(214, 224, 232);
    doc.setFillColor(252, 253, 254);
    doc.roundedRect(x, signatureTop, signerWidth, 45, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(role.toUpperCase(), x + 4, signatureTop + 7);
    if (image && signed) {
      doc.addImage(image, "PNG", x + 4, signatureTop + 9, signerWidth - 8, 16, undefined, "FAST");
    } else if (signed) {
      doc.setFont("times", "italic");
      doc.setFontSize(18);
      doc.setTextColor(...navy);
      doc.text(name, x + 4, signatureTop + 22, { maxWidth: signerWidth - 8 });
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(...muted);
      doc.text("Awaiting signature", x + 4, signatureTop + 21);
    }
    doc.setDrawColor(...teal);
    doc.line(x + 4, signatureTop + 27, x + signerWidth - 4, signatureTop + 27);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...ink);
    doc.text(name, x + 4, signatureTop + 33);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...muted);
    doc.text(email, x + 4, signatureTop + 38);
    doc.text(signed ? `Electronically signed ${formatAgreementDate(signedAt)}` : "Not yet signed", x + 4, signatureTop + 42);
  };
  const buyerSigned = inferredCreatorRole === "buyer" || tx.counterpartyApproved;
  const sellerSigned = inferredCreatorRole === "seller" || tx.counterpartyApproved;
  renderSignature(
    margin,
    "Buyer",
    tx.buyer,
    tx.buyerEmail,
    tx.buyerSignatureDataUrl,
    buyerSigned,
    inferredCreatorRole === "buyer" ? creatorSignedAt : tx.approvedAt ?? approvalEvent?.time,
  );
  renderSignature(
    margin + signerWidth + 8,
    "Seller",
    tx.seller,
    tx.sellerEmail,
    tx.sellerSignatureDataUrl,
    sellerSigned,
    inferredCreatorRole === "seller" ? creatorSignedAt : tx.approvedAt ?? approvalEvent?.time,
  );

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...muted);
    doc.text("Generated by MyEscrow • Electronic agreement record", margin, pageHeight - 9);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 9, { align: "right" });
  }
  doc.save(`${slugify(tx.title)}-agreement.pdf`);
};

const mapEscrowsToTransactions = (
  escrows: EscrowRecord[] | undefined,
  currentUserName: string,
  currentUserEmail: string,
): Transaction[] => {
  if (!escrows?.length) {
    return [];
  }
  return escrows.map((record, index) => {
    const numericId = record.escrowId ?? (Number(record.id.replace(/[^0-9]/g, "")) || 5000 + index);
    const amountValue = parseCurrencyValue(record.amount);
    const counterpart = record.counterpart || "Counterparty";
    const approved = record.counterpartyApproved;
    const lifecycleStatus = record.lifecycleStatus ?? (approved ? "funded" : "pending_approval");
    const fundingStatus = record.fundingStatus ?? (approved ? "funded" : "not_funded");
    const buyer = record.buyer ?? { id: "buyer", name: currentUserName, email: currentUserEmail };
    const seller = record.seller ?? { id: "seller", name: counterpart, email: "counterparty@example.com" };
    const isBuyer = sameEmail(currentUserEmail, buyer.email);
    let status: Transaction["status"] = "Pending";
    if (lifecycleStatus === "funded") {
      status = "Active";
    } else if (lifecycleStatus === "completed") {
      status = "Complete";
    } else if (lifecycleStatus === "cancelled") {
      status = "Cancelled";
    }
    const pendingDetail =
      lifecycleStatus === "pending_counterparty_signup"
        ? `Waiting for ${counterpart} to create an account`
        : lifecycleStatus === "pending_approval"
        ? `Waiting for ${counterpart}`
        : lifecycleStatus === "funding_pending"
          ? "Buyer funding required"
          : lifecycleStatus === "funded"
            ? "Awaiting next milestone"
            : record.due;
    const steps: ProcessStep[] = [
      {
        title: "Agreement drafted",
        detail: pendingDetail,
        status:
          lifecycleStatus === "pending_counterparty_signup" || lifecycleStatus === "pending_approval"
            ? "active"
            : "complete",
      },
      {
        title: "Funding",
        detail:
          lifecycleStatus === "pending_counterparty_signup"
            ? "Counterparty must join before approval"
            : lifecycleStatus === "pending_approval"
            ? "Buyer deposits after approval"
            : lifecycleStatus === "funding_pending"
              ? "Buyer funding pending"
              : "Funds secured in escrow",
        status:
          lifecycleStatus === "pending_counterparty_signup" || lifecycleStatus === "pending_approval"
            ? "upcoming"
            : lifecycleStatus === "funding_pending"
              ? "active"
              : "complete",
      },
      {
        title: "Milestones",
        detail: record.due,
        status: lifecycleStatus === "funded" || lifecycleStatus === "completed" ? "active" : "upcoming",
      },
    ];
    return {
      id: numericId,
      reference: record.id,
      title: record.title || record.stage || counterpart,
      description: record.description,
      counterpart,
      amount: amountValue,
      status,
      context: record.stage || (approved ? "Milestones active" : "Approval pending"),
      lifecycleStatus,
      fundingStatus,
      creatorRole: record.creatorRole,
      createdAt: record.createdAt,
      approvedAt: record.approvedAt,
      buyerSignatureDataUrl: record.buyerSignatureDataUrl,
      sellerSignatureDataUrl: record.sellerSignatureDataUrl,
      userRole: record.role ?? (isBuyer ? "buyer" : "seller"),
      isOwner: record.isOwner,
      steps,
      buyer: buyer.name,
      buyerEmail: buyer.email,
      seller: seller.name,
      sellerEmail: seller.email,
      milestones: (record.milestones ?? []).map((milestone) => ({
        id: milestone.id.toString(),
        title: milestone.title,
        amount: parseCurrencyValue(milestone.amount),
        description: milestone.description,
        status: milestone.status,
        releasedAt: milestone.releasedAt,
        rejectedAt: milestone.rejectedAt,
      })),
      timeline: [],
      counterpartyApproved: approved,
    };
  });
};

function MockExperienceHome({ searchParams }: HomeProps) {
  const resolvedSearchParams = use(searchParams);
  const initialScreenQuery = pickQueryValue(resolvedSearchParams?.screen);
  const initialScreen = isScreenId(initialScreenQuery) ? initialScreenQuery : "welcome";
  const initialTxQuery = pickQueryValue(resolvedSearchParams?.tx);
  const initialTxToken = initialTxQuery ?? undefined;
  const router = useRouter();
  const { user, isAuthenticated, isHydrating, logout } = useAuth();
  const [activeScreen, setActiveScreen] = useState<ScreenId>(initialScreen);
  const [walletBalance, setWalletBalance] = useState(300);
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const transactionsRef = useRef(transactions);
  const visibleTransactionsRef = useRef<Transaction[]>(transactions);
  const [selectedTransactionToken, setSelectedTransactionToken] = useState<string | number | null>(() =>
    initialScreen === "transaction" ? initialTxToken ?? null : null,
  );
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(() => {
    if (initialScreen === "transaction" && initialTxToken) {
      return findTransactionByToken(initialTransactions, initialTxToken);
    }
    return null;
  });
  const [walletHistory, setWalletHistory] = useState<WalletHistoryEntry[]>(initialWalletHistory);
  const [createForm, setCreateForm] = useState({
    role: "buyer" as "buyer" | "seller",
    counterpartyName: "",
    counterpartyEmail: "",
    title: "",
    amount: "",
    category: "Goods",
    description: "",
  });
  const [milestones, setMilestones] = useState<DraftMilestone[]>([]);
  const [milestoneInputs, setMilestoneInputs] = useState({ title: "", amount: "", description: "" });
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [milestoneWarning, setMilestoneWarning] = useState<string | null>(null);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [signatureCaptured, setSignatureCaptured] = useState(false);
  const [signatureVersion, setSignatureVersion] = useState(0);
  const signaturePadRef = useRef<SignaturePadHandle | null>(null);
  const [approvalSignatureCaptured, setApprovalSignatureCaptured] = useState(false);
  const [approvalSignatureVersion, setApprovalSignatureVersion] = useState(0);
  const approvalSignaturePadRef = useRef<SignaturePadHandle | null>(null);
  const [walletAmountInput, setWalletAmountInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState({ name: defaultUser.name, email: defaultUser.email });
  const currentUser = liveDataEnabled && user
    ? {
        name: user.name?.trim() || user.email || profile.name,
        email: user.email || profile.email,
      }
    : profile;
  const [kycMarked, setKycMarked] = useState(false);
  const [modalContent, setModalContent] = useState<ModalContent | null>(null);
  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState(false);
  const [dismissedNotifications, setDismissedNotifications] = useState<string[]>([]);
  const createEscrowMutation = useCreateEscrow();
  const approveEscrowMutation = useApproveEscrow();
  const approveMilestoneMutation = useApproveMilestone();
  const rejectEscrowMutation = useRejectEscrow();
  const rejectMilestoneMutation = useRejectMilestone();
  const resubmitMilestoneMutation = useResubmitMilestone();
  const cancelEscrowMutation = useCancelEscrow();
  const fundEscrowMutation = useFundEscrow();
  const notificationsQuery = useNotifications();
  const overviewQuery = useEscrowSummary();
  const escrowsQuery = useEscrows();
  const liveTimelineEvents = overviewQuery.data?.timelineEvents ?? [];
  const liveTransactions = useMemo(
    () =>
      liveDataEnabled
        ? mapEscrowsToTransactions(escrowsQuery.data?.escrows, currentUser.name, currentUser.email)
        : [],
    [currentUser.email, currentUser.name, escrowsQuery.data?.escrows],
  );
  const liveWalletBalance = overviewQuery.data?.walletBalance;
  const walletBalanceDisplay =
    liveDataEnabled && liveWalletBalance ? parseCurrencyValue(liveWalletBalance) : walletBalance;
  const displayTransactions = liveDataEnabled ? liveTransactions : transactions;
  const { pushToast } = useToast();
  const { confirm } = useConfirmDialog();
  const walletTopup = useWalletTopup();
  const walletWithdraw = useWalletWithdraw();

  const pendingCard = useMemo(
    () => displayTransactions.find((tx) => tx.status === "Pending"),
    [displayTransactions],
  );

  const activeNotifications = useMemo(
    () => displayTransactions.filter((tx) => tx.status !== "Complete").length,
    [displayTransactions],
  );
  const notificationList = notificationsQuery.data?.notifications ?? [];
  const fallbackNotifications = useMemo<NotificationEntry[]>(() => {
    const entries: NotificationEntry[] = [];
    displayTransactions.forEach((tx) => {
      if (tx.status === "Pending") {
        if (tx.lifecycleStatus === "pending_counterparty_signup") {
          entries.push({
            id: `invite-${tx.id}`,
            txId: tx.id,
            label: tx.title,
            detail: tx.isOwner
              ? `Invitation sent. Waiting for ${tx.counterpart} to create and verify an account.`
              : "Finish signup and verify your email to unlock this escrow.",
            meta: "Signup required",
            requiresAction: false,
          });
        } else if (tx.lifecycleStatus === "pending_approval") {
          const waitingOnName =
            tx.isOwner ? (tx.userRole === "buyer" ? tx.seller : tx.buyer) : "You";
          entries.push({
            id: `approval-${tx.id}`,
            txId: tx.id,
            label: tx.title,
            detail: tx.isOwner
              ? `Waiting for ${waitingOnName} to approve the escrow.`
              : "You have been invited to review and approve this escrow.",
            meta: tx.context,
            requiresAction: !tx.isOwner,
          });
        } else if (tx.lifecycleStatus === "funding_pending") {
          const buyerNeedsTopUp = sameEmail(tx.buyerEmail, currentUser.email) && walletBalanceDisplay < tx.amount;
          entries.push({
            id: `funding-${tx.id}`,
            txId: tx.id,
            label: tx.title,
            detail: buyerNeedsTopUp
              ? `Counterparty approved. Top up your wallet before funding ${tx.title}.`
              : "Counterparty approved. Fund this escrow to activate milestone work.",
            meta: buyerNeedsTopUp ? "Wallet top-up required" : "Funding required",
            requiresAction: sameEmail(tx.buyerEmail, currentUser.email),
          });
        }
      } else if (tx.status === "Active") {
        const pendingMilestone = tx.milestones.find((milestone) => milestone.status === "pending");
        if (pendingMilestone) {
          const amountMeta = pendingMilestone.amount ? formatCurrency(pendingMilestone.amount) : null;
          if (sameEmail(tx.buyerEmail, currentUser.email)) {
            entries.push({
              id: `milestone-review-${tx.id}-${pendingMilestone.id}`,
              txId: tx.id,
              label: tx.title,
              detail: `Review "${pendingMilestone.title}" from ${tx.seller} so funds can release.`,
              meta: amountMeta ? `Milestone pending • ${amountMeta}` : "Milestone pending",
              requiresAction: true,
            });
          } else if (sameEmail(tx.sellerEmail, currentUser.email)) {
            entries.push({
              id: `milestone-wait-${tx.id}-${pendingMilestone.id}`,
              txId: tx.id,
              label: tx.title,
              detail: `Waiting for ${tx.buyer} to approve "${pendingMilestone.title}".`,
              meta: amountMeta ? `Buyer approval • ${amountMeta}` : "Buyer approval pending",
              requiresAction: false,
            });
          }
        }
      }
    });
    if (entries.length === 0) {
      entries.push({
        id: "fallback-none",
        label: "All escrows are current",
        detail: "You'll see alerts here as soon as a buyer or seller needs action.",
        meta: "Status check",
        requiresAction: false,
      });
    }
    return entries.slice(0, 4);
  }, [displayTransactions, currentUser.email, walletBalanceDisplay]);
  const shouldUseFallbackNotifications = notificationsQuery.isError || notificationList.length === 0;
  const notificationsToRender = shouldUseFallbackNotifications ? fallbackNotifications : notificationList;
  const timelineEntries = liveDataEnabled
    ? liveTimelineEvents.map((event) => ({
        id: event.id,
        label: event.title,
        detail: event.meta,
        txId: undefined,
      }))
    : dashboardTimelineEntries;
  const requiresCurrentUserAction = (notification: NotificationEntry): boolean => {
    if (typeof notification.requiresAction === "boolean") {
      return notification.requiresAction;
    }
    if (!notification.txId) {
      return false;
    }
    const tx = displayTransactions.find((item) => item.id === notification.txId);
    if (!tx) {
      return false;
    }
    if (tx.status === "Pending") {
      if (tx.lifecycleStatus === "pending_counterparty_signup") {
        return false;
      }
      if (tx.lifecycleStatus === "pending_approval") {
        return !tx.isOwner;
      }
      if (tx.lifecycleStatus === "funding_pending") {
        return sameEmail(tx.buyerEmail, currentUser.email);
      }
      return false;
    }
    if (tx.status === "Active") {
      if (tx.buyer !== currentUser.name) {
        return false;
      }
      return Boolean(tx.milestones.find((milestone) => milestone.status === "pending"));
    }
    return false;
  };
  const orderedNotifications = [...notificationsToRender]
    .sort((a, b) => Number(requiresCurrentUserAction(b)) - Number(requiresCurrentUserAction(a)))
    .filter((item) => !dismissedNotifications.includes(item.id));

  const handleDismissNotification = (notificationId: string) => {
    setDismissedNotifications((prev) => (prev.includes(notificationId) ? prev : [...prev, notificationId]));
  };
  const openNotifications = notificationList.length || activeNotifications;

useEffect(() => {
  if (notificationsQuery.isError) {
    pushToast({
      variant: "error",
      title: "Notifications failed to load. Showing demo alerts.",
    });
  }
}, [notificationsQuery.isError, pushToast]);

useEffect(() => {
  if (!isHydrating && !isAuthenticated) {
    router.replace("/login");
  }
}, [isHydrating, isAuthenticated, router]);

  const milestoneTotal = useMemo(
    () => milestones.reduce((sum, item) => sum + item.amount, 0),
    [milestones],
  );

const agreementPreview = useMemo(() => {
  const amountValue = Number(createForm.amount) || 0;
  const descriptionValue = createForm.description.trim();
  const descriptionLine = descriptionValue ? `\nDescription: ${descriptionValue}` : "";
  const intro = `Buyer: ${createForm.role === "buyer" ? "You" : createForm.counterpartyName || "Buyer"}\nSeller: ${
    createForm.role === "seller" ? "You" : createForm.counterpartyName || "Seller"
  }\nAmount: ${formatCurrency(amountValue)}${descriptionLine}`;
  if (!milestones.length) {
    return intro;
  }
  const detail = milestones
    .map((milestone, index) => `${index + 1}. ${milestone.title} - ${formatCurrency(milestone.amount)}`)
    .join("\n");
  return `${intro}\n\nMilestones:\n${detail}`;
}, [createForm, milestones]);

const navActiveId = useMemo<ScreenId>(() => {
  if (["milestones", "agreement"].includes(activeScreen)) {
    return "create";
  }
  if (activeScreen === "transaction" || activeScreen === "history") {
    return "dashboard";
  }
  return activeScreen;
}, [activeScreen]);

  const navigate = (screen: ScreenId, pushHistory = true) => {
    setActiveScreen(screen);
    setMessage(null);
    if (screen !== "transaction") {
      setSelectedTransaction(null);
      setSelectedTransactionToken(null);
    }
    if (pushHistory) {
      const nextUrl = screen === "welcome" ? "/" : `/?screen=${screen}`;
    window.history.pushState({ screen }, "", nextUrl);
  }
};

const viewTransaction = (tx: Transaction) => {
  setSelectedTransaction(tx);
  setSelectedTransactionToken(tx.reference ?? tx.id);
  setMessage(null);
  const txToken = tx.reference ?? String(tx.id);
  window.history.pushState({ screen: "transaction", txId: txToken }, "", `/?screen=transaction&tx=${encodeURIComponent(txToken)}`);
  setActiveScreen("transaction");
};

const recordWalletHistory = (type: WalletHistoryEntry["type"], amount: number) => {
  setWalletHistory(prev => [
    { id: randomId(), type, amount, date: new Date().toISOString() },
    ...prev,
  ]);
};

const resetSignaturePad = () => {
  setSignatureCaptured(false);
  setSignatureVersion((prev) => prev + 1);
};

useEffect(() => {
  transactionsRef.current = transactions;
}, [transactions]);

useEffect(() => {
  visibleTransactionsRef.current = displayTransactions;
}, [displayTransactions]);

useEffect(() => {
  const handlePopState = (event: PopStateEvent) => {
    const params = new URLSearchParams(window.location.search);
    const fallbackScreen = (params.get("screen") as ScreenId) || "welcome";
    const fallbackTx = params.get("tx");
    const state = (event.state || {}) as { screen?: ScreenId; txId?: string | number };
    const screenFromState = state.screen || fallbackScreen;
    const txFromState = state.txId ?? fallbackTx ?? undefined;
    setActiveScreen(screenFromState);
    if (screenFromState === "transaction" && txFromState) {
      setSelectedTransactionToken(txFromState);
      setSelectedTransaction(findTransactionByToken(visibleTransactionsRef.current, txFromState));
    } else if (screenFromState !== "transaction") {
      setSelectedTransactionToken(null);
      setSelectedTransaction(null);
    }
    setMessage(null);
  };
  window.addEventListener("popstate", handlePopState);
  return () => window.removeEventListener("popstate", handlePopState);
}, []);

const updateTransaction = (id: number, mapper: (tx: Transaction) => Transaction) => {
  let updatedTx: Transaction | null = null;
  setTransactions((prev) =>
    prev.map((tx) => {
      if (tx.id === id) {
        updatedTx = mapper(tx);
        return updatedTx;
      }
      return tx;
    }),
  );
  setSelectedTransaction((current) => {
    if (current && current.id === id) {
      return updatedTx ?? mapper(current);
    }
    return current;
  });
  return updatedTx;
};

const findTransactionById = (id: number) => {
  const pool = liveDataEnabled ? visibleTransactionsRef.current : transactionsRef.current;
  return pool.find((item) => item.id === id) ?? null;
};

  const handleCreateNext = () => {
    if (!createForm.counterpartyName || !createForm.counterpartyEmail || !Number(createForm.amount)) {
      setMessage("Fill in counterparty info and amount to continue.");
      return;
    }
    setMessage(null);
    navigate("milestones");
  };

  const handleAddMilestone = () => {
    if (!milestoneInputs.title || !Number(milestoneInputs.amount)) {
      setMessage("Provide a milestone title and amount.");
      return;
    }
    const nextId = editingMilestoneId ?? randomId();
    setMilestones((prev) => [
      ...prev,
      {
        id: nextId,
        title: milestoneInputs.title,
        amount: Number(milestoneInputs.amount),
        description: milestoneInputs.description.trim(),
      },
    ]);
    setMilestoneInputs({ title: "", amount: "", description: "" });
    setEditingMilestoneId(null);
    setMilestoneWarning(null);
    setMessage(null);
  };

  const handleEditMilestone = (id: string) => {
    setMilestones((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) {
        setMilestoneInputs({
          title: target.title,
          amount: target.amount.toString(),
          description: target.description ?? "",
        });
        setEditingMilestoneId(id);
      }
      return prev.filter((item) => item.id !== id);
    });
    setMessage(null);
  };

  const handleRemoveMilestone = (id: string) => {
    setMilestones((prev) => prev.filter((item) => item.id !== id));
    if (editingMilestoneId === id) {
      setMilestoneInputs({ title: "", amount: "", description: "" });
      setEditingMilestoneId(null);
    }
    setMilestoneWarning(null);
    setMessage(null);
  };

  const handleMilestonesNext = () => {
    const amountValue = Number(createForm.amount);
    if (milestones.length && amountValue && Math.abs(amountValue - milestoneTotal) > 0.01) {
      setMilestoneWarning("Milestone total must match the escrow amount.");
      return;
    }
    setMilestoneWarning(null);
    setAgreementAccepted(false);
    resetSignaturePad();
    setMessage(null);
    navigate("agreement");
  };

  const handleAgreementSubmit = async () => {
    if (!agreementAccepted || !signatureCaptured) {
      setMessage("Accept the agreement and confirm the signature to continue.");
      return;
    }
    const escrowAmount = Number(createForm.amount);
    if (!escrowAmount) {
      setMessage("Enter an escrow amount before submitting.");
      return;
    }
    const responseTitle = createForm.title.trim() || (createForm.category ? `${createForm.category} escrow` : "New escrow");
    const descriptionValue = createForm.description.trim();
    const buyerInfo =
      createForm.role === "buyer"
        ? { name: currentUser.name, email: currentUser.email }
        : { name: createForm.counterpartyName || "Buyer", email: createForm.counterpartyEmail || "buyer@example.com" };
    const sellerInfo =
      createForm.role === "seller"
        ? { name: currentUser.name, email: currentUser.email }
        : { name: createForm.counterpartyName || "Seller", email: createForm.counterpartyEmail || "seller@example.com" };
    const approvalContext =
      createForm.role === "buyer" ? "Seller approval pending" : "Buyer approval pending";
    const approvalDetail =
      createForm.role === "buyer" ? "Seller review pending" : "Buyer review pending";
    const signatureDataUrl = signaturePadRef.current?.getDataUrl();
    if (!signatureDataUrl) {
      setMessage("Please draw your signature before submitting.");
      return;
    }
    try {
      const response: CreateEscrowResponse = await createEscrowMutation.mutateAsync({
        title: responseTitle,
        counterpart: createForm.counterpartyName || "Counterparty",
        counterpartyEmail: createForm.counterpartyEmail || "counterparty@example.com",
        amount: escrowAmount,
        creatorRole: createForm.role,
        category: createForm.category,
        description: descriptionValue || undefined,
        signatureDataUrl,
        milestones: milestones.map((milestone) => ({
          title: milestone.title,
          amount: milestone.amount,
          description: milestone.description || undefined,
        })),
      });
      const inviteStatus = response.invitationStatus ?? "existing_user";
      const requiresSignup = inviteStatus === "signup_required" || inviteStatus === "verification_required";
      const pendingContext =
        inviteStatus === "signup_required"
          ? "Counterparty signup pending"
          : inviteStatus === "verification_required"
            ? "Counterparty verification pending"
            : approvalContext;
      const pendingApprovalDetail =
        inviteStatus === "signup_required"
          ? `${createForm.counterpartyName || "Counterparty"} must create and verify a MyEscrow account.`
          : inviteStatus === "verification_required"
            ? `${createForm.counterpartyName || "Counterparty"} must verify their email before review.`
            : approvalDetail;
      const timestamp = new Date().toISOString();
      const newTx: Transaction = {
        id: response.escrowId ?? Math.floor(10000 + Math.random() * 90000),
        reference: response.reference,
        title: responseTitle,
        counterpart: createForm.role === "buyer" ? sellerInfo.name : buyerInfo.name,
        amount: escrowAmount,
        status: "Pending",
        context: pendingContext,
        lifecycleStatus: requiresSignup ? "pending_counterparty_signup" : "pending_approval",
        fundingStatus: "not_funded",
        creatorRole: createForm.role,
        createdAt: response.createdAt ?? timestamp,
        buyerSignatureDataUrl: createForm.role === "buyer" ? signatureDataUrl : undefined,
        sellerSignatureDataUrl: createForm.role === "seller" ? signatureDataUrl : undefined,
        counterpartyApproved: false,
        description: descriptionValue || undefined,
        steps: [
          { title: "Agreement drafted", detail: "Creator signed the agreement", status: "complete" },
          {
            title: requiresSignup ? "Awaiting signup" : "Awaiting approval",
            detail: pendingApprovalDetail,
            status: "active",
          },
          { title: "Funding pending", detail: "Buyer funds after approval", status: "upcoming" },
        ],
        buyer: buyerInfo.name,
        buyerEmail: buyerInfo.email,
        seller: sellerInfo.name,
        sellerEmail: sellerInfo.email,
        milestones: milestones.map((milestone) => ({
          id: milestone.id,
          title: milestone.title,
          amount: milestone.amount,
          description: milestone.description || undefined,
          status: "pending",
        })),
        timeline: [
          { id: randomId(), label: "Created", detail: `Created by ${currentUser.name}`, time: timestamp },
          {
            id: randomId(),
            label: requiresSignup ? "Invitation sent" : "Awaiting approval",
            detail: requiresSignup
              ? `${createForm.counterpartyName || "Counterparty"} must finish onboarding before review`
              : `${createForm.counterpartyName || "Counterparty"} notified to review`,
            time: timestamp,
          },
        ],
      };
      setTransactions((prev) => [newTx, ...prev]);
      setCreateForm({
        role: "buyer",
        counterpartyName: "",
        counterpartyEmail: "",
        title: "",
        amount: "",
        category: "Goods",
        description: "",
      });
      setMilestones([]);
      setMilestoneInputs({ title: "", amount: "", description: "" });
      setEditingMilestoneId(null);
      setAgreementAccepted(false);
      resetSignaturePad();
      setMessage(
        inviteStatus === "signup_required"
          ? "Invitation sent. Funding can continue after the counterparty creates and verifies an account."
          : inviteStatus === "verification_required"
            ? "Invitation sent. Funding can continue after the counterparty verifies their account."
            : "Escrow drafted. Funding will start after both parties sign.",
      );
      navigate("dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create escrow. Try again shortly.");
    }
  };

  const handleMilestoneDecision = (txId: number, milestoneId: string, decision: "approve" | "reject") => {
    const target = findTransactionById(txId);
    if (!target) {
      setMessage("Transaction not found.");
      return;
    }
    if (sameEmail(currentUser.email, target.sellerEmail)) {
      setMessage("Only the buyer can approve milestone releases.");
      return;
    }
    if (!target.counterpartyApproved) {
      setMessage("Wait for the counterparty to approve the project before reviewing milestones.");
      return;
    }
    if (target.status !== "Active") {
      setMessage("Milestones can only be approved once the escrow is active and funded.");
      return;
    }
    if (liveDataEnabled) {
      const escrowId = target.reference ?? `PO-${target.id}`;
      const mutation = decision === "approve" ? approveMilestoneMutation : rejectMilestoneMutation;
      const actionLabel = decision === "approve" ? "approve" : "reject";
      const executeLiveDecision = async () => {
        try {
          await mutation.mutateAsync({ escrowId, milestoneId });
          setMessage(
            decision === "approve"
              ? "Milestone approved and dummy funds released to the seller."
              : "Milestone rejected and sent back for revision.",
          );
        } catch (error) {
          setMessage(error instanceof Error ? error.message : `Unable to ${actionLabel} milestone.`);
        }
      };
      if (decision === "approve") {
        confirm({
          title: "Approve milestone?",
          body: "Approve this milestone and release only this milestone's dummy funds to the seller.",
          confirmLabel: "Approve milestone",
          onConfirm: executeLiveDecision,
        });
        return;
      }
      void executeLiveDecision();
      return;
    }
    const executeDecision = () => {
      const updated = updateTransaction(txId, (tx) => {
        const timestamp = new Date().toISOString();
      let targetTitle = "";
      const updatedMilestones: TxMilestone[] = tx.milestones.map((milestone): TxMilestone => {
        if (milestone.id !== milestoneId) {
          return milestone;
        }
        targetTitle = milestone.title;
        if (decision === "approve") {
          return {
            ...milestone,
            status: "released",
            releasedAt: timestamp,
            rejectedAt: undefined,
          };
        }
        return {
          ...milestone,
          status: "rejected",
          rejectedAt: timestamp,
        };
      });
        const allReleased = updatedMilestones.length > 0 && updatedMilestones.every((item) => item.status === "released");
        const anyRejected = updatedMilestones.some((item) => item.status === "rejected");
        let status = tx.status;
        let context = tx.context;
        if (allReleased) {
          status = "Complete";
          context = "All milestones paid";
        } else if (anyRejected) {
          context = "Milestone requires attention";
        } else if (decision === "approve") {
          context = "Milestones active";
        }
        const nextTimeline =
          targetTitle.trim().length === 0
            ? tx.timeline
            : [
                {
                  id: randomId(),
                  label: decision === "approve" ? "Milestone approved" : "Milestone rejected",
                  detail:
                    decision === "approve"
                      ? `"${targetTitle}" released to the seller`
                      : `"${targetTitle}" sent back for revision`,
                  time: timestamp,
                },
                ...tx.timeline,
              ];
        return {
          ...tx,
          milestones: updatedMilestones,
          status,
          context,
          timeline: nextTimeline,
        };
      });
      if (updated) {
        setMessage(
          decision === "approve"
            ? "Milestone approved and funds released."
            : "Milestone rejected and sent back for updates.",
        );
      }
    };
    if (decision === "approve") {
      confirm({
        title: "Approve milestone?",
        body: "Are you sure you want to approve this milestone? This action cannot be undone.",
        confirmLabel: "Approve milestone",
        onConfirm: executeDecision,
      });
      return;
    }
    executeDecision();
  };

  const handleMilestoneResubmit = async (txId: number, milestoneId: string) => {
    const target = findTransactionById(txId);
    if (!target) {
      setMessage("Transaction not found.");
      return;
    }
    if (liveDataEnabled) {
      const escrowId = target.reference ?? `PO-${target.id}`;
      try {
        await resubmitMilestoneMutation.mutateAsync({ escrowId, milestoneId });
        setMessage("Milestone resubmitted for buyer review.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to resubmit milestone.");
      }
      return;
    }

    const updated = updateTransaction(txId, (tx) => ({
      ...tx,
      milestones: tx.milestones.map((milestone) =>
        milestone.id === milestoneId
          ? {
              ...milestone,
              status: "pending",
              rejectedAt: undefined,
            }
          : milestone,
      ),
      context: "Milestones active",
      timeline: [
        {
          id: randomId(),
          label: "Milestone resubmitted",
          detail: "Seller resubmitted work for buyer review",
          time: new Date().toISOString(),
        },
        ...tx.timeline,
      ],
    }));
    if (updated) {
      setMessage("Milestone resubmitted for buyer review.");
    }
  };

  const handleApproveEscrow = async (tx: Transaction) => {
    const escrowId = tx.reference ?? `PO-${tx.id}`;
    const signatureDataUrl = approvalSignaturePadRef.current?.getDataUrl();
    if (!signatureDataUrl) {
      setMessage("Draw your signature before approving the agreement.");
      return;
    }
    try {
      await approveEscrowMutation.mutateAsync({ escrowId, signatureDataUrl });
      approvalSignaturePadRef.current?.clear();
      setApprovalSignatureCaptured(false);
      setApprovalSignatureVersion((version) => version + 1);
      setMessage("Escrow approved. The buyer can now fund it with dummy wallet funds.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to approve escrow.");
    }
  };

  const handleRejectEscrow = async (tx: Transaction) => {
    const escrowId = tx.reference ?? `PO-${tx.id}`;
    try {
      await rejectEscrowMutation.mutateAsync({ escrowId });
      setMessage("Escrow rejected.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to reject escrow.");
    }
  };

  const handleCancelEscrow = async (tx: Transaction) => {
    const escrowId = tx.reference ?? `PO-${tx.id}`;
    try {
      await cancelEscrowMutation.mutateAsync({ escrowId });
      setMessage("Escrow cancelled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to cancel escrow.");
    }
  };

  const handleFundEscrow = (tx: Transaction) => {
    const escrowId = tx.reference ?? `PO-${tx.id}`;
    confirm({
      title: "Fund escrow with dummy wallet funds?",
      body: `This will move ${formatCurrency(tx.amount)} from your MyEscrow test wallet into escrow. No bank account will be charged.`,
      confirmLabel: "Fund escrow",
      onConfirm: async () => {
        try {
          await fundEscrowMutation.mutateAsync({ escrowId });
          setMessage("Escrow funded with dummy wallet funds.");
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Unable to fund escrow.");
        }
      },
    });
  };

  const handleWalletTopup = async () => {
    const amount = Number(walletAmountInput);
    if (!amount || amount <= 0) {
      setMessage("Enter a valid top-up amount.");
      return;
    }
    try {
      const response = await walletTopup.mutateAsync({ amount });
      setWalletBalance(response.balance ?? walletBalance + amount);
      recordWalletHistory("deposit", amount);
      setWalletAmountInput("");
      setMessage("Wallet topped up.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to top up wallet.");
    }
  };

const handleWalletWithdraw = async () => {
    const amount = Number(walletAmountInput);
    if (!amount || amount <= 0) {
      setMessage("Enter a valid withdrawal amount.");
      return;
    }
    if (amount > walletBalanceDisplay) {
      setMessage("Not enough balance to withdraw.");
      return;
    }
    try {
      const response = await walletWithdraw.mutateAsync({ amount });
      setWalletBalance(response.balance ?? walletBalance - amount);
      recordWalletHistory("withdraw", amount);
      setWalletAmountInput("");
      setMessage("Withdrawal requested.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to withdraw.");
    }
  };

  const handleAlertsClick = () => {
    setNotificationsPanelOpen((prev) => {
      const next = !prev;
      if (!prev) {
        void notificationsQuery.refetch();
      }
      return next;
    });
  };

  const showAlertsPanel = () => {
    if (!notificationsPanelOpen) {
      void notificationsQuery.refetch();
    }
    setNotificationsPanelOpen(true);
  };

  const closeNotificationsPanel = () => {
    setNotificationsPanelOpen(false);
  };

  const findTransactionForNotification = (notification: NotificationEntry) => {
    const pool = visibleTransactionsRef.current;
    if (notification.txId) {
      return pool.find((tx) => tx.id === notification.txId);
    }
    const text = `${notification.label} ${notification.detail}`.toLowerCase();
    return pool.find(
      (tx) =>
        text.includes(tx.title.toLowerCase()) ||
        text.includes(tx.counterpart.toLowerCase()) ||
        text.includes(String(tx.id)),
    );
  };

  const handleNotificationSelect = (notification: NotificationEntry) => {
    const targetTx = findTransactionForNotification(notification);
    if (targetTx) {
      viewTransaction(targetTx);
    } else {
      navigate("dashboard");
    }
    setNotificationsPanelOpen(false);
  };

  const handleSignatureClear = () => {
    signaturePadRef.current?.clear();
    resetSignaturePad();
  };

  const handleMarkKyc = () => {
    setKycMarked(true);
    setMessage("KYC marked for your profile.");
  };

  const handleSaveProfile = () => {
    setMessage("Profile saved.");
  };

  const handleLogout = () => {
    logout();
    pushToast({ variant: "info", title: "You have been signed out." });
    router.replace("/login");
  };

  const openSupportModal = () =>
    setModalContent({
      title: "Support",
      body: "For demo assistance or integration help, email support@myescrow.com.",
    });

  const openSecurityModal = () =>
    setModalContent({
      title: "Change password",
      body: "Enter your current password and choose a new one in the production app.",
    });

  const openBankModal = () =>
    setModalContent({
      title: "Add bank account",
      body: "Provide your routing and account number to connect a bank in the full experience.",
    });

  const closeModal = () => setModalContent(null);

  const renderWelcome = () => (
    <section className="screen active">
      <h2 className="page-title">
        Welcome back,
        <span style={{ fontWeight: 700, marginLeft: 6 }}>{currentUser.name}</span>
      </h2>
      <div className="tiles">
        <div className="tile">
          <div className="t-title">Wallet</div>
          <div className="muted">Balance</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{formatCurrency(walletBalanceDisplay)}</div>
          <button className="ghost" onClick={() => navigate("wallet")}>
            Manage
          </button>
        </div>
        <div className="tile">
          <div className="t-title">Recent</div>
          <div className="muted">Last activity</div>
          {displayTransactions.length ? (
            <button
              className="ghost"
              style={{ width: "100%", justifyContent: "space-between" }}
              onClick={() => viewTransaction(displayTransactions[0])}
            >
              <span>{displayTransactions[0].title}</span>{" "}
              <span>{formatCurrency(displayTransactions[0].amount)}</span>
            </button>
          ) : (
            <div className="muted">No activity</div>
          )}
        </div>
        <div className="tile">
          <div className="t-title">Active</div>
          <div className="muted">Ongoing escrows</div>
          <button className="ghost" onClick={() => navigate("dashboard")}>
            View
          </button>
        </div>
        <div className="tile">
          <div className="t-title">Escrow history</div>
          <div className="muted">Past escrows</div>
          <button className="ghost" onClick={() => navigate("history")}>
            View history
          </button>
        </div>
      </div>
      <div className="home-stack">
        {pendingCard ? (
          <div className="card alert-card">
            <div className="alert-pill">Pending action</div>
            <div className="alert-head">
              <div>
                <div className="muted">{pendingCard.context}</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{pendingCard.title}</div>
                <div className="muted" style={{ marginTop: 4 }}>
                  {pendingCard.counterpart}
                </div>
              </div>
              <button className="ghost" onClick={() => viewTransaction(pendingCard)}>
                View escrow
              </button>
            </div>
            <div className="process-steps">
              {pendingCard.steps.map((step) => (
                <div key={step.title} className="process-step" data-status={step.status}>
                  <div className="process-step-title">{step.title}</div>
                  <div className="process-step-detail">{step.detail}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Recent transactions</h3>
          <div className="tx-list">
            {displayTransactions.map((tx) => (
              <button key={tx.id} className="tx-item tx-item-button" type="button" onClick={() => viewTransaction(tx)}>
                <div>
                  <div style={{ fontWeight: 700 }}>{tx.title}</div>
                  <div className="muted">{tx.counterpart}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div>{formatCurrency(tx.amount)}</div>
                  <span
                    className={`status-badge ${
                      tx.status === "Complete"
                        ? "status-released"
                        : tx.status === "Active"
                          ? "status-active"
                          : "status-pending"
                    }`}
                  >
                    {tx.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );

  const renderDashboard = () => (
    <section className="screen active">
      <h2 className="page-title">Dashboard</h2>
      <p className="lead">Overview of your transactions and quick actions.</p>
      <div className="tiles">
        <button
          className="tile tile-button"
          type="button"
          onClick={showAlertsPanel}
          style={{ textAlign: "left" }}
        >
          <div className="t-title">Alerts</div>
          <div className="muted">Open items</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{openNotifications}</div>
          <div className="muted" style={{ marginTop: 8 }}>
            Tap to view details
          </div>
        </button>
        <button
          className="tile tile-button"
          type="button"
          onClick={() => navigate("wallet")}
          style={{ textAlign: "left" }}
        >
          <div className="t-title">Wallet</div>
          <div className="muted">Available balance</div>
        <div style={{ fontSize: 26, fontWeight: 800 }}>{formatCurrency(walletBalanceDisplay)}</div>
          <div className="muted" style={{ marginTop: 8 }}>
            Manage funds
          </div>
        </button>
      </div>
      <div className="card" style={{ marginBottom: 12 }}>
        <strong>Transactions</strong>
        <div className="tx-list" style={{ marginTop: 12 }}>
          {displayTransactions.map((tx) => (
            <div
              key={tx.id}
              className="tx-item tx-item--interactive"
              role="button"
              tabIndex={0}
              onClick={() => viewTransaction(tx)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  viewTransaction(tx);
                }
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{tx.title}</div>
                <div className="muted">{tx.counterpart}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div>{formatCurrency(tx.amount)}</div>
                <div className="muted">{tx.context}</div>
                  <div className="flex flex-wrap gap-2 justify-end mt-2" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <strong>Milestone timeline</strong>
          <span className="muted" style={{ fontSize: 13 }}>Recent alerts</span>
        </div>
        <div className="tx-list" style={{ marginTop: 12 }}>
          {timelineEntries.length === 0 ? (
            <div className="muted">No milestone activity yet for this account.</div>
          ) : (
            timelineEntries.map((event) => (
              <button
                key={event.id}
                className="tx-item timeline-entry-card tx-item--interactive"
                onClick={() => {
                  const targetTx =
                    (event.txId ? displayTransactions.find((tx) => tx.id === event.txId) : undefined) ??
                    displayTransactions.find((tx) => tx.title === event.label || tx.counterpart === event.label) ??
                    displayTransactions[0];
                  if (targetTx) {
                    viewTransaction(targetTx);
                  }
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{event.label}</div>
                  <div className="muted">{event.detail}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  );

  const renderCreate = () => {
    const counterpartLabel = createForm.role === "buyer" ? "Seller" : "Buyer";
    const formattedAmount = createForm.amount ? formatCurrency(Number(createForm.amount) || 0) : "-";
    const descriptionPreview = createForm.description.trim();

    return (
      <section className="screen active create-flow">
        <div className="create-flow__hero">
          <span className="create-flow__eyebrow">Step 1 - Transaction details</span>
          <h2 className="page-title create-flow__title">Create a new transaction</h2>
          <p className="lead create-flow__lead">
            Invite your counterparty, set the working amount, and we&apos;ll guide both sides through milestones,
            signatures, and funding once both sides approve.
          </p>
        </div>
        <div className="create-flow__grid">
          <div className="card create-flow__form-card">
            <div className="create-form-section">
              <div className="muted create-form-label">Your role</div>
              <div className="role-toggle create-form-role">
                {["buyer", "seller"].map((role) => (
                  <label
                    key={role}
                    className={`role-option ${createForm.role === role ? "active" : ""}`}
                    onClick={() =>
                      setCreateForm((prev) => ({
                        ...prev,
                        role: role as "buyer" | "seller",
                      }))
                    }
                  >
                    <input type="radio" name="role" checked={createForm.role === role} readOnly />
                    <span className="role-copy">
                      {role === "buyer" ? "I'm the buyer" : "I'm the seller"}
                      <span
                        className="flow-info"
                        tabIndex={0}
                        aria-label={roleFlowCopy[role as "buyer" | "seller"].label}
                      >
                        i
                        <div className="flow-hint">
                          <div className="flow-pill">{roleFlowCopy[role as "buyer" | "seller"].pill}</div>
                          <ol className="flow-steps">
                            {roleFlowCopy[role as "buyer" | "seller"].steps.map((step) => (
                              <li key={`${role}-${step}`}>{step}</li>
                            ))}
                          </ol>
                        </div>
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="create-form-section">
              <div className="form-field">
                <label className="muted">Escrow name</label>
                <input
                  type="text"
                  value={createForm.title}
                  placeholder="e.g., Northwind onboarding kit"
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                />
              </div>
              <div className="form-field">
                <label className="muted">{counterpartLabel} name</label>
                <input
                  type="text"
                  value={createForm.counterpartyName}
                  placeholder={`${counterpartLabel} company or contact`}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, counterpartyName: event.target.value }))
                  }
                />
              </div>
              <div className="form-field">
                <label className="muted">{counterpartLabel} email</label>
                <input
                  type="email"
                  value={createForm.counterpartyEmail}
                  placeholder="counterparty@example.com"
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, counterpartyEmail: event.target.value }))
                  }
                />
              </div>
              <div className="form-field">
                <label className="muted">Amount</label>
                <input
                  type="number"
                  value={createForm.amount}
                  placeholder="USD"
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, amount: event.target.value }))
                  }
                />
              </div>
              <div className="form-field">
                <label className="muted">Category</label>
                <select
                  value={createForm.category}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, category: event.target.value }))
                  }
                >
                  <option>Goods</option>
                  <option>Services</option>
                  <option>Other</option>
                </select>
              </div>
              <div className="form-field">
                <label className="muted" htmlFor="escrow-description">
                  Escrow description
                </label>
                <textarea
                  id="escrow-description"
                  rows={3}
                  value={createForm.description}
                  placeholder="Brief context to help both parties remember the scope"
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="create-flow__actions">
              <button className="ghost" onClick={() => navigate("welcome")}>
                Cancel
              </button>
              <button className="btn" onClick={handleCreateNext}>
                Next - Milestones
              </button>
            </div>
          </div>
          <aside className="card create-flow__aside">
            <h3 className="create-aside-title">What happens next</h3>
            <ol className="create-flow__steps">
              {createGuideSteps.map((step, index) => (
                <li key={step.title}>
                  <span className="create-step-index">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="create-step-title">{step.title}</div>
                    <p className="muted create-step-detail">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="create-summary">
              <div>
                <div className="create-summary-label muted">{counterpartLabel}</div>
                <div className="create-summary-value">
                  {createForm.counterpartyName || "Not added yet"}
                </div>
                <div className="create-summary-meta">
                  {createForm.counterpartyEmail || "Email pending"}
                </div>
              </div>
              <div>
                <div className="create-summary-label muted">Escrow amount</div>
                <div className="create-summary-value">{formattedAmount}</div>
                <div className="create-summary-meta">Category: {createForm.category}</div>
              </div>
              <div>
                <div className="create-summary-label muted">Description</div>
                <div className="create-summary-meta">
                  {descriptionPreview ? descriptionPreview : "Add a short summary"}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    );
  };

  const renderMilestones = () => {
    const formattedEscrowAmount = createForm.amount ? formatCurrency(Number(createForm.amount) || 0) : "-";

    return (
      <section className="screen active">
        <h2 className="page-title">Milestones</h2>
        <p className="lead">Break the agreement into deliverables before moving on to the terms.</p>
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginBottom: 8 }}>How funds are released</h3>
          <div className="flow-grid">
            <div className="flow-block">
              <div className="flow-pill">Milestone release</div>
              <ol className="flow-steps">
                {milestoneReleaseSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="muted">Milestone builder</div>
          <p className="muted" style={{ margin: "4px 0 8px", fontSize: 13 }}>
            Add payout checkpoints that should match your escrow amount.
          </p>
        <div className="milestone-target">
            <div>
              <div className="milestone-target__label">Escrow amount</div>
              <div className="milestone-target__sub">Milestones should total this value.</div>
            </div>
            <div className="milestone-target__value">{formattedEscrowAmount}</div>
          </div>
        <div className="milestone-form">
          <div className="form-field">
            <label className="muted" htmlFor="milestone-title">
              Milestone title
            </label>
              <input
                id="milestone-title"
                type="text"
                value={milestoneInputs.title}
                onChange={(event) =>
                  setMilestoneInputs((prev) => ({ ...prev, title: event.target.value }))
                }
              />
            </div>
            <div className="form-field">
              <label className="muted" htmlFor="milestone-amount">
                Amount
              </label>
              <input
                id="milestone-amount"
                type="number"
                value={milestoneInputs.amount}
                onChange={(event) =>
                  setMilestoneInputs((prev) => ({ ...prev, amount: event.target.value }))
                }
              />
            </div>
          <button type="button" className="ghost" onClick={handleAddMilestone}>
            {editingMilestoneId ? "Save milestone" : "Add milestone"}
          </button>
        </div>
        <div className="form-field">
          <label className="muted" htmlFor="milestone-description">
            Milestone description
          </label>
          <textarea
            id="milestone-description"
            rows={3}
            value={milestoneInputs.description}
            placeholder="Explain what unlocks this payout"
            onChange={(event) =>
              setMilestoneInputs((prev) => ({ ...prev, description: event.target.value }))
            }
          />
        </div>
          {editingMilestoneId ? (
            <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
              Editing milestone - update the fields and choose &quot;Save milestone&quot; to apply changes.
            </div>
          ) : null}
          {milestones.length === 0 ? (
            <div className="muted" style={{ marginTop: 8 }}>
              No milestones yet
            </div>
          ) : (
            <>
              <div className="tx-list" style={{ marginTop: 8 }}>
                {milestones.map((milestone) => (
                  <div key={milestone.id} className="tx-item milestone-entry">
                  <div className="milestone-entry__top">
                    <div>
                      <strong>{milestone.title}</strong>
                      <div className="muted">Milestone</div>
                      {milestone.description ? (
                        <p className="muted" style={{ margin: "4px 0 0" }}>
                          {milestone.description}
                        </p>
                      ) : null}
                    </div>
                    <div style={{ textAlign: "right", fontWeight: 600 }}>
                      {formatCurrency(milestone.amount)}
                    </div>
                  </div>
                    <div className="milestone-actions">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => handleEditMilestone(milestone.id)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => handleRemoveMilestone(milestone.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="muted" style={{ textAlign: "right", marginTop: 8 }}>
                Total: {formatCurrency(milestoneTotal)}
              </div>
            </>
          )}
          <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="ghost" onClick={() => navigate("create")}>
              Back
            </button>
            <button className="btn" onClick={handleMilestonesNext}>
              Next - Terms
            </button>
          </div>
          {milestoneWarning ? (
            <div className="milestone-warning" role="alert">
              {milestoneWarning}
            </div>
          ) : null}
        </div>
      </section>
    );
  };

  const renderAgreement = () => (
    <section className="screen active">
      <h2 className="page-title">Agreement & Signature</h2>
      <p className="lead">Review terms and sign to accept.</p>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Funding happens after both parties agree to the terms, so no deposits are needed right now.
      </p>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="form-field">
          <label className="muted">Agreement preview</label>
          <textarea value={agreementPreview} rows={8} readOnly />
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="muted">Milestones</div>
          {milestones.length === 0 ? (
            <div className="muted" style={{ marginTop: 4 }}>
              No milestones added
            </div>
          ) : (
            <>
              <div className="tx-list" style={{ marginTop: 8 }}>
                {milestones.map((milestone) => (
                  <div key={milestone.id} className="tx-item">
                    <div>
                      <strong>{milestone.title}</strong>
                      <div className="muted">Milestone</div>
                      {milestone.description ? (
                        <p className="muted" style={{ margin: "4px 0 0" }}>
                          {milestone.description}
                        </p>
                      ) : null}
                    </div>
                    <div style={{ textAlign: "right" }}>{formatCurrency(milestone.amount)}</div>
                  </div>
                ))}
              </div>
              <div className="muted" style={{ textAlign: "right", marginTop: 8 }}>
                Total: {formatCurrency(milestoneTotal)}
              </div>
            </>
          )}
        </div>
        <div className="sig-wrap">
          <div className="muted" style={{ marginBottom: 6 }}>
            Signature
          </div>
          <div className="signature-pad">
            <SignaturePad
              ref={signaturePadRef}
              resetVersion={signatureVersion}
              onSignedChange={setSignatureCaptured}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
            <button className="ghost" onClick={handleSignatureClear}>
              Clear
            </button>
            <div className="muted" style={{ marginLeft: "auto" }}>
              Draw with mouse or touch
            </div>
          </div>
        </div>
        <label style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={agreementAccepted}
            onChange={(event) => setAgreementAccepted(event.target.checked)}
          />
          I agree to the escrow terms
        </label>
        <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="ghost" onClick={() => navigate("milestones")}>
            Back
          </button>
          <button
            className="btn"
            onClick={handleAgreementSubmit}
            disabled={createEscrowMutation.isPending}
          >
            {createEscrowMutation.isPending ? "Submitting..." : "Submit escrow"}
          </button>
        </div>
      </div>
    </section>
  );

  const renderWallet = () => (
    <section className="screen active">
      <h2 className="page-title">Wallet</h2>
      <p className="lead">Track deposits and withdrawals.</p>
      <div className="card">
        <div className="muted">Available balance</div>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{formatCurrency(walletBalanceDisplay)}</div>
        <label className="muted" style={{ marginTop: 8 }}>
          Top-up (mock)
        </label>
        <input
          type="number"
          value={walletAmountInput}
          placeholder="Amount to deposit"
          onChange={(event) => setWalletAmountInput(event.target.value)}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
          <button className="btn" onClick={handleWalletTopup} disabled={walletTopup.isPending}>
            {walletTopup.isPending ? "Processing..." : "Deposit"}
          </button>
          <button className="ghost" onClick={handleWalletWithdraw} disabled={walletWithdraw.isPending}>
            {walletWithdraw.isPending ? "Processing..." : "Withdraw"}
          </button>
        </div>
        <h4 style={{ marginTop: 16 }}>History</h4>
        {walletHistory.length === 0 ? (
          <div className="muted" style={{ marginTop: 8 }}>
            No wallet activity
          </div>
        ) : (
          <div className="tx-list" style={{ marginTop: 8 }}>
            {walletHistory.map((entry) => (
              <div key={entry.id} className="tx-item">
                <div>
                  <strong>{entry.type === "deposit" ? "Deposit" : "Withdrawal"}</strong>
                  <div className="muted">{formatHistoryDate(entry.date)}</div>
                </div>
                <div style={{ textAlign: "right", fontWeight: 600 }}>
                  {entry.type === "deposit" ? "+" : "-"}
                  {formatCurrency(entry.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );

  const renderHistory = () => (
    <section className="screen active">
      <h2 className="page-title">History</h2>
      <p className="lead">Past escrows and payouts.</p>
      <div className="card">
        {displayTransactions
          .filter((tx) => tx.status === "Complete")
          .map((tx) => (
            <div key={tx.id} className="tx-item" style={{ marginBottom: 8 }}>
              <div>
                <strong>{tx.title}</strong>
                <div className="muted">{tx.counterpart}</div>
              </div>
              <div>{formatCurrency(tx.amount)}</div>
            </div>
          ))}
      </div>
    </section>
  );

  const renderEscrows = () => {
    const activeTransactions = displayTransactions.filter((tx) => tx.status === "Active");
    return (
      <section className="screen active">
        <h2 className="page-title">Active escrows</h2>
        <p className="lead">Track milestones that can release funds.</p>
        <div className="card">
          {activeTransactions.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              You have no active escrows right now.
            </p>
          ) : (
            <div className="tx-list">
              {activeTransactions.map((tx) => (
                <button key={tx.id} className="tx-item tx-item-button" type="button" onClick={() => viewTransaction(tx)}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{tx.title}</div>
                    <div className="muted">{tx.counterpart}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div>{formatCurrency(tx.amount)}</div>
                    <div className="muted">{tx.context}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  };

  const renderSettings = () => (
    <section className="screen active settings-screen">
      <h2 className="page-title">Settings</h2>
      <p className="lead">Manage profile, security, and payout settings.</p>
      <div className="settings-stack">
        <div className="card setting-card">
          <div className="settings-form">
            <label className="muted" htmlFor="profile-name">
              Full name
            </label>
            <input
              id="profile-name"
              type="text"
              value={profile.name}
              placeholder="Your name"
              onChange={(event) => setProfile((prev) => ({ ...prev, name: event.target.value }))}
            />
            <label className="muted" htmlFor="profile-email">
              Email
            </label>
            <input
              id="profile-email"
              type="email"
              value={profile.email}
              placeholder="you@example.com"
              onChange={(event) => setProfile((prev) => ({ ...prev, email: event.target.value }))}
            />
          </div>
          <div className="settings-actions">
            <button className="ghost" onClick={handleMarkKyc} disabled={kycMarked}>
              {kycMarked ? "KYC marked" : "Mark KYC"}
            </button>
            <button className="btn" onClick={handleSaveProfile}>
              Save
            </button>
            <button className="ghost" onClick={openSupportModal}>
              Contact support
            </button>
            <button className="ghost" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>Security</h3>
          <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
            Update your password to keep your account protected.
          </p>
          <button className="btn" onClick={openSecurityModal}>
            Change password
          </button>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>Bank accounts</h3>
          <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
            Add a payout account to receive escrow releases.
          </p>
          <button className="ghost" onClick={openBankModal}>
            Add bank account
          </button>
        </div>
      </div>
    </section>
  );

  const renderTransactionDetail = () => {
    const tx = liveDataEnabled && selectedTransaction
      ? findTransactionByToken(
          displayTransactions,
          selectedTransactionToken ?? selectedTransaction.reference ?? selectedTransaction.id,
        ) ?? selectedTransaction
      : selectedTransaction;
    if (!tx) {
      return (
        <section className="screen active">
          <h2 className="page-title">Transaction</h2>
          <div className="card">
            <p className="muted">Select a transaction from the dashboard to view its details.</p>
          </div>
        </section>
      );
    }
    const canReviewMilestones = tx.counterpartyApproved && tx.status === "Active";
    const isCurrentUserBuyer = sameEmail(currentUser.email, tx.buyerEmail);
    const isAwaitingSignup = tx.lifecycleStatus === "pending_counterparty_signup";
    const isAwaitingApproval = tx.lifecycleStatus === "pending_approval";
    const isAwaitingFunding = tx.lifecycleStatus === "funding_pending";
    const canApproveEscrow = !tx.isOwner && isAwaitingApproval;
    const canFundEscrow = isCurrentUserBuyer && isAwaitingFunding;
    const walletShortfall = Math.max(tx.amount - walletBalanceDisplay, 0);
    const canCancelEscrow =
      Boolean(tx.isOwner) &&
      tx.status !== "Cancelled" &&
      tx.status !== "Complete" &&
      (isAwaitingSignup || isAwaitingApproval);
    return (
      <section className="screen active">
        <h2 className="page-title">Transaction</h2>
        <div className="card">
          <div style={{ marginBottom: 12 }}>
            <div className="muted">Title</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{tx.title}</div>
          </div>
          {tx.description ? (
            <div style={{ marginBottom: 12 }}>
              <div className="muted">Description</div>
              <p className="muted" style={{ marginTop: 4, whiteSpace: "pre-line" }}>
                {tx.description}
              </p>
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>
              <div className="muted">Buyer</div>
              <div style={{ fontWeight: 700 }}>{tx.buyer}</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {tx.buyerEmail}
              </div>
              <div className="muted" style={{ marginTop: 12 }}>
                Seller
              </div>
              <div style={{ fontWeight: 700 }}>{tx.seller}</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {tx.sellerEmail}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="muted">Amount</div>
              <div style={{ fontWeight: 700 }}>{formatCurrency(tx.amount)}</div>
              <div className="muted" style={{ marginTop: 8 }}>
                Status
              </div>
              <span
                  className={`status-badge ${
                    tx.status === "Complete"
                      ? "status-released"
                      : tx.status === "Active"
                        ? "status-active"
                        : tx.status === "Pending"
                          ? "status-pending"
                          : "status-active"
                  }`}
              >
                {tx.status}
              </span>
              {tx.status !== "Complete" ? (
                <div className="muted" style={{ marginTop: 8 }}>
                  {tx.context}
                </div>
              ) : null}
            </div>
          </div>
          <div style={{ marginTop: 12, textAlign: "right" }}>
            <button className="ghost" onClick={() => downloadAgreementPdf(tx)}>
              Download agreement (PDF)
            </button>
          </div>
        </div>
        {(canApproveEscrow || canFundEscrow || canCancelEscrow) ? (
          <div className="card" style={{ marginTop: 12 }}>
            <strong>Next step</strong>
            <p className="muted" style={{ marginTop: 8, marginBottom: 12 }}>
              {canApproveEscrow
                ? "Review the invitation and approve or reject the escrow."
                : canFundEscrow
                  ? walletShortfall > 0
                    ? `Top up your wallet with ${formatCurrency(walletShortfall)} more before you can fund this escrow.`
                    : "Move dummy wallet funds into escrow so milestone work can begin."
                  : isAwaitingSignup
                    ? "This escrow is waiting for the counterparty to finish signup and verification."
                    : "This draft is still waiting for counterparty approval."}
            </p>
            {canApproveEscrow ? (
              <div className="sig-wrap" style={{ marginBottom: 12 }}>
                <div className="muted" style={{ marginBottom: 6 }}>
                  Your signature
                </div>
                <div className="signature-pad">
                  <SignaturePad
                    ref={approvalSignaturePadRef}
                    resetVersion={approvalSignatureVersion}
                    onSignedChange={setApprovalSignatureCaptured}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                  <button
                    className="ghost"
                    onClick={() => {
                      approvalSignaturePadRef.current?.clear();
                      setApprovalSignatureCaptured(false);
                    }}
                  >
                    Clear
                  </button>
                  <div className="muted" style={{ marginLeft: "auto" }}>
                    Sign to approve these terms
                  </div>
                </div>
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {canApproveEscrow ? (
                <>
                  <button
                    className="btn"
                    onClick={() => handleApproveEscrow(tx)}
                    disabled={approveEscrowMutation.isPending || !approvalSignatureCaptured}
                  >
                    {approveEscrowMutation.isPending ? "Approving..." : "Approve escrow"}
                  </button>
                  <button
                    className="ghost"
                    onClick={() => handleRejectEscrow(tx)}
                    disabled={rejectEscrowMutation.isPending}
                  >
                    {rejectEscrowMutation.isPending ? "Rejecting..." : "Reject escrow"}
                  </button>
                </>
              ) : null}
              {canFundEscrow ? (
                <button
                  className="btn"
                  onClick={() => handleFundEscrow(tx)}
                  disabled={fundEscrowMutation.isPending || walletBalanceDisplay < tx.amount}
                >
                  {fundEscrowMutation.isPending ? "Funding..." : `Fund with dummy wallet (${formatCurrency(tx.amount)})`}
                </button>
              ) : null}
              {canFundEscrow && walletBalanceDisplay < tx.amount ? (
                <div className="muted" style={{ width: "100%" }}>
                  Wallet balance: {formatCurrency(walletBalanceDisplay)}. Required: {formatCurrency(tx.amount)}. Top up
                  your wallet before funding this escrow.
                </div>
              ) : null}
              {canCancelEscrow ? (
                <button
                  className="ghost"
                  onClick={() => handleCancelEscrow(tx)}
                  disabled={cancelEscrowMutation.isPending}
                >
                  {cancelEscrowMutation.isPending ? "Cancelling..." : "Cancel draft"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {tx.milestones.length ? (
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <strong>Milestones</strong>
            </div>
            {!canReviewMilestones ? (
              <div className="muted" style={{ marginTop: 8 }}>
                {isAwaitingSignup
                  ? "Milestone decisions unlock after the counterparty finishes signup and verification."
                  : isAwaitingApproval
                    ? `Milestone decisions unlock after ${isCurrentUserBuyer ? "the seller approves" : "you approve"} the escrow.`
                    : isAwaitingFunding
                      ? `Milestone decisions unlock after ${isCurrentUserBuyer ? "you fund" : "the buyer funds"} the escrow.`
                      : "Milestone decisions are not available yet."}
              </div>
            ) : null}
            <div className="tx-list" style={{ marginTop: 12 }}>
              {tx.milestones.map((milestone) => (
                <div key={milestone.id} className="tx-item milestone-entry">
                  <div className="milestone-entry__top">
                    <div>
                      <strong>{milestone.title}</strong>
                      <div className="muted">
                        {milestone.status === "released"
                          ? `Released ${milestone.releasedAt ? formatHistoryDate(milestone.releasedAt) : ""}`
                          : milestone.status === "rejected"
                            ? `Rejected ${milestone.rejectedAt ? formatHistoryDate(milestone.rejectedAt) : ""}`
                            : "Pending release"}
                      </div>
                      {milestone.description ? (
                        <p className="muted" style={{ margin: "4px 0 0" }}>
                          {milestone.description}
                        </p>
                      ) : null}
                    </div>
                    <div style={{ textAlign: "right", fontWeight: 700 }}>{formatCurrency(milestone.amount)}</div>
                  </div>
                  <div className="milestone-actions">
                    {milestone.status === "pending" ? (
                      <>
                        {isCurrentUserBuyer ? (
                          <>
                            <button
                              className="btn"
                              onClick={() => handleMilestoneDecision(tx.id, milestone.id, "approve")}
                              disabled={!canReviewMilestones || approveMilestoneMutation.isPending}
                            >
                              {approveMilestoneMutation.isPending ? "Approving..." : "Approve"}
                            </button>
                            <button
                              className="ghost"
                              onClick={() => handleMilestoneDecision(tx.id, milestone.id, "reject")}
                              disabled={!canReviewMilestones || rejectMilestoneMutation.isPending}
                            >
                              {rejectMilestoneMutation.isPending ? "Rejecting..." : "Reject"}
                            </button>
                          </>
                        ) : null}
                      </>
                    ) : milestone.status === "rejected" && sameEmail(tx.sellerEmail, currentUser.email) ? (
                      <button
                        className="ghost"
                        onClick={() => handleMilestoneResubmit(tx.id, milestone.id)}
                        disabled={resubmitMilestoneMutation.isPending}
                      >
                        {resubmitMilestoneMutation.isPending ? "Resubmitting..." : "Resubmit"}
                      </button>
                    ) : (
                      <span className={`milestone-chip milestone-chip--${milestone.status}`}>
                        {milestone.status === "released" ? "Approved" : "Rejected"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {tx.timeline.length ? (
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <strong>Timeline</strong>
            </div>
            <div className="tx-list" style={{ marginTop: 12 }}>
              {[...tx.timeline]
                .sort(
                  (a, b) =>
                    new Date(b.time).getTime() - new Date(a.time).getTime(),
                )
                .map((event) => (
                <div key={event.id} className="tx-item timeline-entry-card">
                  <div>
                    <div style={{ fontWeight: 700 }}>{event.label}</div>
                    <div className="muted">{event.detail}</div>
                  </div>
                  <div className="muted timeline-entry-time">{formatDateTime(event.time)}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div style={{ marginTop: 12 }}>
          <button className="ghost" onClick={() => navigate("dashboard")}>
            Back to dashboard
          </button>
        </div>
      </section>
    );
  };

  const renderScreen = () => {
    switch (activeScreen) {
      case "dashboard":
        return renderDashboard();
      case "create":
        return renderCreate();
      case "milestones":
        return renderMilestones();
      case "agreement":
        return renderAgreement();
      case "wallet":
        return renderWallet();
      case "history":
        return renderHistory();
      case "escrows":
        return renderEscrows();
      case "settings":
        return renderSettings();
      case "transaction":
        return renderTransactionDetail();
      default:
        return renderWelcome();
    }
  };

  if (isHydrating || !isAuthenticated) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <p className="auth-eyebrow">Loading account…</p>
        </div>
      </main>
    );
  }

  return (
    <AppShell screenId={activeScreen}>
      <Header
        notificationCount={openNotifications}
        primaryLabel="New escrow"
        onPrimaryClick={() => navigate("create")}
        onBrandClick={() => navigate("welcome")}
        onSettingsClick={() => navigate("settings")}
        onLogoutClick={handleLogout}
        onAlertsClick={handleAlertsClick}
      />
      <main className="app-main">
        {message ? (
          <div className="card" style={{ marginBottom: 12, borderLeft: "4px solid var(--accent-orange)" }}>
            <div className="muted">{message}</div>
          </div>
        ) : null}
        {renderScreen()}
      </main>
      <footer className="toolbar">
        <div className="toolbar-shell">
          <nav className="bottom-nav">
            {bottomNav.map((item) => (
              <button
                key={item.id}
                className={navActiveId === item.id ? "active" : ""}
                onClick={() => navigate(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </footer>
      {notificationsPanelOpen ? (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="notifications-backdrop"
            onClick={closeNotificationsPanel}
          />
          <div className="notifications-panel" role="dialog" aria-modal="true">
            <div className="notifications-panel-head">
              <div>
                <h3 style={{ margin: 0 }}>Notifications</h3>
                <p className="muted" style={{ margin: "4px 0 0" }}>
                  Latest account alerts
                </p>
              </div>
              <button className="ghost" onClick={closeNotificationsPanel}>
                Close
              </button>
            </div>
            {notificationsQuery.isLoading ? (
              <div className="muted" style={{ marginTop: 12 }}>
                Loading alerts...
              </div>
            ) : (
              <div className="notif-list">
                {orderedNotifications.map((item) => (
                  <div
                    key={item.id}
                    className="notif-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleNotificationSelect(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleNotificationSelect(item);
                      }
                    }}
                  >
                    <div className="notif-title">
                      <span className="notif-title-text">{item.label}</span>
                      <span className="notif-badge">Alert</span>
                      <button
                        type="button"
                        className="notif-dismiss"
                        style={{
                          marginLeft: "auto",
                          border: "none",
                          background: "transparent",
                          color: "inherit",
                          fontSize: 18,
                          lineHeight: 1,
                          cursor: "pointer",
                        }}
                        aria-label="Dismiss alert"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDismissNotification(item.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                    <div className="notif-detail">{item.detail}</div>
                    <div className="notif-meta">
                      {item.createdAt ? <NotificationTimestamp createdAt={item.createdAt} /> : item.meta}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
      {modalContent ? (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <h3>{modalContent.title}</h3>
            <p className="muted">{modalContent.body}</p>
            <div style={{ textAlign: "right", marginTop: 12 }}>
              <button className="ghost" onClick={closeModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

export default function Home(props: HomeProps) {
  if (liveDashboardEnabled) {
    return <LiveDashboard />;
  }
  return <MockExperienceHome searchParams={props.searchParams} />;
}
