"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import {
  useApproveEscrow,
  useApproveMilestone,
  useApplyMilestoneChanges,
  useCancelEscrow,
  type CreateEscrowResponse,
  useCreateEscrow,
  useDismissNotification,
  useFundEscrow,
  useRejectEscrow,
  useRejectMilestone,
  useRequestMilestoneChanges,
  useResubmitMilestone,
  useEscrowSummary,
  useEscrows,
  useNotificationHistory,
  useNotifications,
  useWalletTopup,
  useWalletTransactions,
  useWalletWithdraw,
} from "@/hooks/useDashboardData";
import { useToast } from "@/components/ToastProvider";
import { useAuth } from "@/components/AuthProvider";
import { moveItem, sortByDeadline } from "@/lib/milestoneOrdering";
import { formatCurrencyInput, normalizeCurrencyInput } from "@/lib/currencyInput";
import {
  resolveProfileDraft,
  type ProfileDraft,
  type ProfileIdentity,
} from "@/lib/profileSettings";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import { jsPDF } from "jspdf";
import { LiveDashboard } from "@/components/LiveDashboard";
import { NotificationTimestamp } from "@/components/NotificationTimestamp";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
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
  deadline?: string;
  requestedTitle?: string;
  requestedDescription?: string;
  requestedAmount?: number;
  requestedDeadline?: string;
  changeRequestNote?: string;
  changeRequestedAt?: string;
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
  deadline: string;
};

type MilestoneChangeDraft = {
  milestoneId: string;
  title: string;
  description: string;
  amount: string;
  deadline: string;
  note: string;
};

type MilestoneReviewDraft = {
  title: string;
  description: string;
  amount: string;
  deadline: string;
};

const buildMilestoneReviewDraft = (milestone: TxMilestone): MilestoneReviewDraft => ({
  title: milestone.requestedTitle ?? milestone.title,
  description: milestone.requestedDescription ?? milestone.description ?? "",
  amount: (milestone.requestedAmount ?? milestone.amount).toString(),
  deadline: (milestone.requestedDeadline ?? milestone.deadline ?? "").slice(0, 10),
});

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
      const deadlineText = milestone.deadline ? `Due ${formatHistoryDate(milestone.deadline)}` : "";
      const rowHeight = Math.max(15, 11 + descriptionLines.length * 4 + (deadlineText ? 4 : 0));
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
      if (deadlineText) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text(deadlineText, margin + 9, cursorY + 9 + descriptionLines.length * 4);
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
          lifecycleStatus === "pending_counterparty_signup" || lifecycleStatus === "pending_approval" || lifecycleStatus === "changes_requested"
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
            : lifecycleStatus === "changes_requested"
              ? "Milestone changes must be resolved first"
            : lifecycleStatus === "funding_pending"
              ? "Buyer funding pending"
              : "Funds secured in escrow",
        status:
          lifecycleStatus === "pending_counterparty_signup" || lifecycleStatus === "pending_approval" || lifecycleStatus === "changes_requested"
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
        deadline: milestone.deadline,
        requestedTitle: milestone.requestedTitle,
        requestedDescription: milestone.requestedDescription,
        requestedAmount: milestone.requestedAmount ? parseCurrencyValue(milestone.requestedAmount) : undefined,
        requestedDeadline: milestone.requestedDeadline,
        changeRequestNote: milestone.changeRequestNote,
        changeRequestedAt: milestone.changeRequestedAt,
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
  const mainContentRef = useRef<HTMLElement | null>(null);
  const [walletBalanceOverride, setWalletBalanceOverride] = useState<{
    userId: string;
    balance: number;
  } | null>(null);
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
  const [walletHistoryOverride, setWalletHistoryOverride] = useState<{
    userId: string;
    entries: WalletHistoryEntry[];
  } | null>(null);
  const [createForm, setCreateForm] = useState({
    role: "buyer" as "buyer" | "seller",
    counterpartyEmail: "",
    title: "",
    amount: "",
    category: "Goods",
    description: "",
  });
  const [milestones, setMilestones] = useState<DraftMilestone[]>([]);
  const [milestoneInputs, setMilestoneInputs] = useState({ title: "", amount: "", description: "", deadline: "" });
  const milestoneDeadlineRef = useRef<HTMLInputElement | null>(null);
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [milestoneWarning, setMilestoneWarning] = useState<string | null>(null);
  const [milestoneChangeDraft, setMilestoneChangeDraft] = useState<MilestoneChangeDraft | null>(null);
  const [milestoneReviewDrafts, setMilestoneReviewDrafts] = useState<Record<string, MilestoneReviewDraft>>({});
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [signatureCaptured, setSignatureCaptured] = useState(false);
  const [signatureVersion, setSignatureVersion] = useState(0);
  const signaturePadRef = useRef<SignaturePadHandle | null>(null);
  const [approvalSignatureCaptured, setApprovalSignatureCaptured] = useState(false);
  const [approvalSignatureVersion, setApprovalSignatureVersion] = useState(0);
  const approvalSignaturePadRef = useRef<SignaturePadHandle | null>(null);
  const [walletAmountInput, setWalletAmountInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({
    userId: "demo-scott",
    name: defaultUser.name,
    email: defaultUser.email,
  });
  const [profileFormDraft, setProfileFormDraft] = useState<ProfileDraft>({
    userId: "demo-scott",
    name: defaultUser.name,
    email: defaultUser.email,
  });
  const profileIdentity: ProfileIdentity = user
    ? {
        id: user.id,
        name: user.name?.trim() || user.email,
        email: user.email,
      }
    : { id: profileDraft.userId, name: profileDraft.name, email: profileDraft.email };
  const currentUser = { name: profileIdentity.name, email: profileIdentity.email };
  const savedProfile = resolveProfileDraft(profileDraft, profileIdentity);
  const profile = resolveProfileDraft(profileFormDraft, profileIdentity);
  const greetingName = currentUser.name.trim().split(/\s+/)[0] || currentUser.name;
  const [modalContent, setModalContent] = useState<ModalContent | null>(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState(false);

  const createEscrowMutation = useCreateEscrow();
  const dismissNotificationMutation = useDismissNotification();
  const approveEscrowMutation = useApproveEscrow();
  const approveMilestoneMutation = useApproveMilestone();
  const rejectEscrowMutation = useRejectEscrow();
  const rejectMilestoneMutation = useRejectMilestone();
  const requestMilestoneChangesMutation = useRequestMilestoneChanges();
  const applyMilestoneChangesMutation = useApplyMilestoneChanges();
  const resubmitMilestoneMutation = useResubmitMilestone();
  const cancelEscrowMutation = useCancelEscrow();
  const fundEscrowMutation = useFundEscrow();
  const notificationsQuery = useNotifications();
  const notificationHistoryQuery = useNotificationHistory();
  const overviewQuery = useEscrowSummary();
  const escrowsQuery = useEscrows();
  const walletTransactionsQuery = useWalletTransactions(liveDataEnabled);
  const liveTransactions = liveDataEnabled
    ? mapEscrowsToTransactions(escrowsQuery.data?.escrows, currentUser.name, currentUser.email)
    : [];
  const liveWalletBalance = overviewQuery.data?.walletBalance;
  const walletStateUserId = user?.id ?? "anonymous";
  const isSeededDemoUser = !liveDataEnabled && Boolean(user && sameEmail(user.email, defaultUser.email));
  const mockWalletBalance =
    walletBalanceOverride?.userId === walletStateUserId
      ? walletBalanceOverride.balance
      : isSeededDemoUser
        ? 300
        : 0;
  const mockWalletHistory =
    walletHistoryOverride?.userId === walletStateUserId
      ? walletHistoryOverride.entries
      : isSeededDemoUser
        ? initialWalletHistory
        : [];
  const walletBalanceDisplay =
    liveDataEnabled ? parseCurrencyValue(liveWalletBalance ?? "0") : mockWalletBalance;
  const walletHistoryDisplay: WalletHistoryEntry[] = liveDataEnabled
    ? (walletTransactionsQuery.data?.transactions ?? []).map((entry) => ({
        id: entry.id,
        type:
          entry.direction === "debit" || entry.type.toUpperCase().includes("WITHDRAW")
            ? "withdraw"
            : "deposit",
        amount: parseCurrencyValue(entry.amount),
        date: entry.createdAt,
      }))
    : mockWalletHistory;
  const displayTransactions = liveDataEnabled ? liveTransactions : transactions;
  const { pushToast } = useToast();
  const { confirm } = useConfirmDialog();
  const walletTopup = useWalletTopup();
  const walletWithdraw = useWalletWithdraw();

  const pendingCard = displayTransactions.find((tx) => tx.status === "Pending");

  const notificationList = notificationsQuery.data?.notifications ?? [];
  const fallbackNotifications: NotificationEntry[] = (() => {
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
  })();
  const shouldUseFallbackNotifications = !liveDataEnabled && (notificationsQuery.isError || notificationList.length === 0);
  const notificationsToRender = shouldUseFallbackNotifications ? fallbackNotifications : notificationList;
  const timelineEntries = liveDataEnabled
    ? (notificationHistoryQuery.data?.notifications ?? []).map((notification) => ({
        id: notification.id,
        label: notification.label,
        detail: notification.detail,
        txId: notification.txId,
        createdAt: notification.createdAt,
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
    .sort((a, b) => Number(requiresCurrentUserAction(b)) - Number(requiresCurrentUserAction(a)));

  const handleDismissNotification = (notificationId: string) => {
    void dismissNotificationMutation.mutateAsync(notificationId).catch((error) => {
      pushToast({
        variant: "error",
        title: error instanceof Error ? error.message : "Unable to dismiss notification.",
      });
    });
  };
  const openNotifications = orderedNotifications.length;

useEffect(() => {
  if (notificationsQuery.isError) {
    pushToast({
      variant: "error",
      title: "Notifications failed to load.",
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
  const intro = `Buyer: ${createForm.role === "buyer" ? "You" : createForm.counterpartyEmail || "Buyer pending"}\nSeller: ${
    createForm.role === "seller" ? "You" : createForm.counterpartyEmail || "Seller pending"
  }\nAmount: ${formatCurrency(amountValue)}${descriptionLine}`;
  if (!milestones.length) {
    return intro;
  }
  const detail = milestones
    .map((milestone, index) =>
      `${index + 1}. ${milestone.title} - ${formatCurrency(milestone.amount)}${
        milestone.deadline ? ` - due ${formatHistoryDate(milestone.deadline)}` : ""
      }`,
    )
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
    if (screen !== activeScreen && (screen === "settings" || activeScreen === "settings")) {
      setProfileFormDraft({ userId: profileIdentity.id, ...savedProfile });
    }
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
  setWalletHistoryOverride({
    userId: walletStateUserId,
    entries: [
      { id: randomId(), type, amount, date: new Date().toISOString() },
      ...mockWalletHistory,
    ],
  });
};

const resetSignaturePad = () => {
  setSignatureCaptured(false);
  setSignatureVersion((prev) => prev + 1);
};

const openMilestoneDeadlinePicker = () => {
  const input = milestoneDeadlineRef.current;
  if (!input) return;
  try {
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
  } catch {
    // Fall back to the native focus/click behavior below.
  }
  input.focus();
  input.click();
};

useEffect(() => {
  transactionsRef.current = transactions;
}, [transactions]);

useEffect(() => {
  visibleTransactionsRef.current = displayTransactions;
}, [displayTransactions]);

useEffect(() => {
  const frameId = window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    mainContentRef.current?.focus({ preventScroll: true });
  });
  return () => window.cancelAnimationFrame(frameId);
}, [activeScreen]);

useEffect(() => {
  const handlePopState = (event: PopStateEvent) => {
    const params = new URLSearchParams(window.location.search);
    const fallbackScreen = (params.get("screen") as ScreenId) || "welcome";
    const fallbackTx = params.get("tx");
    const state = (event.state || {}) as { screen?: ScreenId; txId?: string | number };
    const screenFromState = state.screen || fallbackScreen;
    const txFromState = state.txId ?? fallbackTx ?? undefined;
    setProfileFormDraft({
      userId: profileIdentity.id,
      name: savedProfile.name,
      email: savedProfile.email,
    });
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
}, [profileIdentity.id, savedProfile.email, savedProfile.name]);

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
    if (!createForm.counterpartyEmail || !Number(createForm.amount)) {
      setMessage("Enter the counterparty email and amount to continue.");
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
    setMilestones((prev) =>
      sortByDeadline([
        ...prev,
        {
          id: nextId,
          title: milestoneInputs.title,
          amount: Number(milestoneInputs.amount),
          description: milestoneInputs.description.trim(),
          deadline: milestoneInputs.deadline,
        },
      ]),
    );
    setMilestoneInputs({ title: "", amount: "", description: "", deadline: "" });
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
          deadline: target.deadline ?? "",
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
      setMilestoneInputs({ title: "", amount: "", description: "", deadline: "" });
      setEditingMilestoneId(null);
    }
    setMilestoneWarning(null);
    setMessage(null);
  };

  const handleMoveMilestone = (index: number, direction: -1 | 1) => {
    setMilestones((prev) => moveItem(prev, index, index + direction));
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
          deadline: milestone.deadline ? new Date(`${milestone.deadline}T00:00:00.000Z`).toISOString() : undefined,
        })),
      });
      const inviteStatus = response.invitationStatus ?? "existing_user";
      const requiresSignup = inviteStatus === "signup_required" || inviteStatus === "verification_required";
      const counterpartyName = response.counterpart ?? createForm.counterpartyEmail;
      const buyerInfo =
        createForm.role === "buyer"
          ? { name: currentUser.name, email: currentUser.email }
          : { name: counterpartyName, email: createForm.counterpartyEmail };
      const sellerInfo =
        createForm.role === "seller"
          ? { name: currentUser.name, email: currentUser.email }
          : { name: counterpartyName, email: createForm.counterpartyEmail };
      const pendingContext =
        inviteStatus === "signup_required"
          ? "Counterparty signup pending"
          : inviteStatus === "verification_required"
            ? "Counterparty verification pending"
            : approvalContext;
      const pendingApprovalDetail =
        inviteStatus === "signup_required"
          ? `${counterpartyName} must create and verify a MyEscrow account.`
          : inviteStatus === "verification_required"
            ? `${counterpartyName} must verify their email before review.`
            : approvalDetail;
      const timestamp = new Date().toISOString();
      const newTx: Transaction = {
        id: response.escrowId ?? 10000 + transactionsRef.current.length,
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
          deadline: milestone.deadline || undefined,
          status: "pending",
        })),
        timeline: [
          { id: randomId(), label: "Created", detail: `Created by ${currentUser.name}`, time: timestamp },
          {
            id: randomId(),
            label: requiresSignup ? "Invitation sent" : "Awaiting approval",
            detail: requiresSignup
              ? `${counterpartyName} must finish onboarding before review`
              : `${counterpartyName} notified to review`,
            time: timestamp,
          },
        ],
      };
      setTransactions((prev) => [newTx, ...prev]);
      setCreateForm({
        role: "buyer",
        counterpartyEmail: "",
        title: "",
        amount: "",
        category: "Goods",
        description: "",
      });
      setMilestones([]);
      setMilestoneInputs({ title: "", amount: "", description: "", deadline: "" });
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

  const beginMilestoneChangeRequest = (milestone: TxMilestone) => {
    setMilestoneChangeDraft({
      milestoneId: milestone.id,
      title: milestone.title,
      description: milestone.description ?? "",
      amount: milestone.amount.toString(),
      deadline: milestone.deadline?.slice(0, 10) ?? "",
      note: "",
    });
  };

  const handleRequestMilestoneChanges = async (tx: Transaction) => {
    if (!milestoneChangeDraft || !milestoneChangeDraft.title.trim() || Number(milestoneChangeDraft.amount) <= 0) {
      setMessage("Provide proposed milestone wording and a valid cost.");
      return;
    }
    const escrowId = tx.reference ?? `PO-${tx.id}`;
    try {
      await requestMilestoneChangesMutation.mutateAsync({
        escrowId,
        milestoneId: milestoneChangeDraft.milestoneId,
        title: milestoneChangeDraft.title.trim(),
        description: milestoneChangeDraft.description.trim() || undefined,
        amount: Number(milestoneChangeDraft.amount),
        deadline: milestoneChangeDraft.deadline
          ? new Date(`${milestoneChangeDraft.deadline}T00:00:00.000Z`).toISOString()
          : undefined,
        note: milestoneChangeDraft.note.trim() || undefined,
      });
      setMilestoneChangeDraft(null);
      setMessage("Requested milestone changes sent to the escrow creator.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to request milestone changes.");
    }
  };

  const updateMilestoneReviewDraft = (
    milestone: TxMilestone,
    updates: Partial<MilestoneReviewDraft>,
  ) => {
    setMilestoneReviewDrafts((current) => ({
      ...current,
      [milestone.id]: {
        ...(current[milestone.id] ?? buildMilestoneReviewDraft(milestone)),
        ...updates,
      },
    }));
  };

  const handleApplyMilestoneChanges = async (
    tx: Transaction,
    milestone: TxMilestone,
    decision: "accept" | "reject",
  ) => {
    const escrowId = tx.reference ?? `PO-${tx.id}`;
    const reviewDraft = milestoneReviewDrafts[milestone.id] ?? buildMilestoneReviewDraft(milestone);
    const amount = Number(reviewDraft.amount);
    if (decision === "accept" && (!reviewDraft.title.trim() || !Number.isFinite(amount) || amount <= 0)) {
      setMessage("Enter a milestone title and a valid amount before accepting the changes.");
      return;
    }
    try {
      await applyMilestoneChangesMutation.mutateAsync({
        escrowId,
        milestoneId: milestone.id,
        decision,
        ...(decision === "accept"
          ? {
              title: reviewDraft.title.trim(),
              description: reviewDraft.description.trim(),
              amount,
              deadline: reviewDraft.deadline
                ? new Date(`${reviewDraft.deadline}T00:00:00.000Z`).toISOString()
                : null,
            }
          : {}),
      });
      setMilestoneReviewDrafts((current) => {
        const next = { ...current };
        delete next[milestone.id];
        return next;
      });
      setMessage(
        decision === "accept"
          ? "The reviewed changes were accepted and saved."
          : "The requested changes were declined and the original milestone was kept.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to complete the milestone review.");
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
      await walletTopup.mutateAsync({ amount });
      if (!liveDataEnabled) {
        setWalletBalanceOverride({ userId: walletStateUserId, balance: mockWalletBalance + amount });
        recordWalletHistory("deposit", amount);
      }
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
      await walletWithdraw.mutateAsync({ amount });
      if (!liveDataEnabled) {
        setWalletBalanceOverride({ userId: walletStateUserId, balance: mockWalletBalance - amount });
        recordWalletHistory("withdraw", amount);
      }
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

  const handleSaveProfile = () => {
    const nextProfile = { userId: profileIdentity.id, ...profile };
    setProfileDraft(nextProfile);
    setProfileFormDraft(nextProfile);
    setMessage("Profile saved.");
  };

  const handleProfileChange = (field: "name" | "email", value: string) => {
    setProfileFormDraft((previous) => ({
      userId: profileIdentity.id,
      ...resolveProfileDraft(previous, profileIdentity),
      [field]: value,
    }));
  };

  const handleLogout = () => {
    logout();
    pushToast({ variant: "info", title: "You have been signed out." });
    router.replace("/login");
  };

  const openSecurityModal = () => setChangePasswordOpen(true);

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
        <span style={{ fontWeight: 700, marginLeft: 6 }}>{greetingName}</span>
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
          <strong>Alert history</strong>
          <span className="muted" style={{ fontSize: 13 }}>All account alerts</span>
        </div>
        <div className="tx-list" style={{ marginTop: 12 }}>
          {timelineEntries.length === 0 ? (
            <div className="muted">No alert history yet for this account.</div>
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
                  {"createdAt" in event && event.createdAt ? (
                    <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                      <NotificationTimestamp createdAt={event.createdAt} />
                    </div>
                  ) : null}
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

    return (
      <section className="screen active create-flow">
        <div className="create-flow__hero">
          <span className="create-flow__eyebrow">Step 1 - Transaction details</span>
          <h2 className="page-title create-flow__title">Create a new transaction</h2>
          <div className="lead create-flow__lead">
            <ol style={{ margin: "0 0 8px", paddingLeft: 22 }}>
              <li>Invite your counterparty.</li>
              <li>Set the amount.</li>
            </ol>
            <p style={{ margin: 0 }}>
              We&apos;ll guide both sides through milestones, signatures, and funding once both sides approve.
            </p>
          </div>
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
                  type="text"
                  inputMode="decimal"
                  value={formatCurrencyInput(createForm.amount)}
                  placeholder="$0.00"
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      amount: normalizeCurrencyInput(event.target.value),
                    }))
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
          </aside>
        </div>
      </section>
    );
  };

  const renderMilestones = () => {
    const escrowAmount = Number(createForm.amount) || 0;
    const formattedEscrowAmount = createForm.amount ? formatCurrency(escrowAmount) : "-";
    const remainingEscrowAmount = escrowAmount - milestoneTotal;

    return (
      <section className="screen active">
        <h2 className="page-title">Milestones</h2>
        <p className="lead">Break the agreement into deliverables before moving on to the terms.</p>
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginBottom: 8 }}>How funds are released</h3>
          <div className="flow-grid">
            <details className="flow-block flow-explainer">
              <summary className="flow-pill">View explanation</summary>
              <ol className="flow-steps">
                {milestoneReleaseSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </details>
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
            <div className="milestone-target__totals">
              <div className="milestone-target__value">{formattedEscrowAmount}</div>
              <div className="milestone-target__running">
                Running total: {formatCurrency(milestoneTotal)}
              </div>
              <output
                className="milestone-target__remaining"
                data-overdrawn={remainingEscrowAmount < 0}
                aria-label="Remaining escrow amount"
              >
                <span>Remaining escrow amount</span>
                <strong>{formatCurrency(remainingEscrowAmount)}</strong>
              </output>
            </div>
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
            <div className="form-field">
              <label className="muted" htmlFor="milestone-deadline">
                Deadline
              </label>
              <div className="date-input-control">
                <input
                  ref={milestoneDeadlineRef}
                  id="milestone-deadline"
                  type="date"
                  value={milestoneInputs.deadline}
                  onChange={(event) =>
                    setMilestoneInputs((prev) => ({ ...prev, deadline: event.target.value }))
                  }
                />
                <button
                  type="button"
                  className="date-picker-trigger"
                  aria-label="Choose milestone deadline"
                  onClick={openMilestoneDeadlinePicker}
                >
                  <svg
                    aria-hidden="true"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <path d="M16 3v4M8 3v4M3 10h18" />
                  </svg>
                </button>
              </div>
            </div>
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
        <div className="milestone-add-action">
          <button type="button" className="ghost" onClick={handleAddMilestone}>
            {editingMilestoneId ? "Save milestone" : "Add milestone"}
          </button>
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
                {milestones.map((milestone, index) => (
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
                      {milestone.deadline ? (
                        <div className="muted" style={{ marginTop: 4 }}>
                          Due {formatHistoryDate(milestone.deadline)}
                        </div>
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
                        disabled={index === 0}
                        onClick={() => handleMoveMilestone(index, -1)}
                        aria-label={`Move ${milestone.title} up`}
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={index === milestones.length - 1}
                        onClick={() => handleMoveMilestone(index, 1)}
                        aria-label={`Move ${milestone.title} down`}
                      >
                        Move down
                      </button>
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
                      {milestone.deadline ? (
                        <div className="muted" style={{ marginTop: 4 }}>
                          Due {formatHistoryDate(milestone.deadline)}
                        </div>
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
      <div className="card wallet-card">
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
        <div className="wallet-actions">
          <button className="btn" onClick={handleWalletTopup} disabled={walletTopup.isPending}>
            {walletTopup.isPending ? "Processing..." : "Deposit"}
          </button>
          <button className="ghost" onClick={handleWalletWithdraw} disabled={walletWithdraw.isPending}>
            {walletWithdraw.isPending ? "Processing..." : "Withdraw"}
          </button>
        </div>
        <h4 style={{ marginTop: 16 }}>History</h4>
        {walletHistoryDisplay.length === 0 ? (
          <div className="muted" style={{ marginTop: 8 }}>
            No wallet activity
          </div>
        ) : (
          <div className="tx-list" style={{ marginTop: 8 }}>
            {walletHistoryDisplay.map((entry) => (
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
              onChange={(event) => handleProfileChange("name", event.target.value)}
            />
            <label className="muted" htmlFor="profile-email">
              Email
            </label>
            <input
              id="profile-email"
              type="email"
              value={profile.email}
              placeholder="you@example.com"
              onChange={(event) => handleProfileChange("email", event.target.value)}
            />
          </div>
          <div className="settings-actions">
            <button className="ghost" onClick={handleSaveProfile}>
              Save
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
    const isChangesRequested = tx.lifecycleStatus === "changes_requested";
    const isAwaitingFunding = tx.lifecycleStatus === "funding_pending";
    const canApproveEscrow = !tx.isOwner && isAwaitingApproval;
    const canFundEscrow = isCurrentUserBuyer && isAwaitingFunding;
    const walletShortfall = Math.max(tx.amount - walletBalanceDisplay, 0);
    const canCancelEscrow =
      Boolean(tx.isOwner) &&
      tx.status !== "Cancelled" &&
      tx.status !== "Complete" &&
      (isAwaitingSignup || isAwaitingApproval || isChangesRequested);
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
        {(canApproveEscrow || canFundEscrow || canCancelEscrow || (tx.isOwner && isChangesRequested)) ? (
          <div className="card" style={{ marginTop: 12 }}>
            <strong>Next step</strong>
            <p className="muted" style={{ marginTop: 8, marginBottom: 12 }}>
              {canApproveEscrow
                ? "Review the invitation and approve or reject the escrow."
                : tx.isOwner && isChangesRequested
                  ? "Review and apply the requested milestone changes below."
                : canFundEscrow
                  ? walletShortfall > 0
                    ? `Top up your wallet with ${formatCurrency(walletShortfall)} more before you can fund this escrow.`
                    : "Move dummy wallet funds into escrow so milestone work can begin."
                  : isAwaitingSignup
                    ? "This escrow is waiting for the counterparty to finish signup and verification."
                    : isChangesRequested
                      ? "The escrow creator is reviewing requested milestone changes."
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
                {tx.status === "Complete"
                  ? "All milestones have been released. This escrow is complete."
                  : isAwaitingSignup
                  ? "Milestone decisions unlock after the counterparty finishes signup and verification."
                  : isAwaitingApproval
                    ? `Milestone decisions unlock after ${isCurrentUserBuyer ? "the seller approves" : "you approve"} the escrow.`
                    : isChangesRequested
                      ? tx.isOwner
                        ? "Review each requested revision. You can edit the proposal, accept it, or keep the original milestone."
                        : "Your requested milestone changes are awaiting the creator's review."
                    : isAwaitingFunding
                      ? `Milestone decisions unlock after ${isCurrentUserBuyer ? "you fund" : "the buyer funds"} the escrow.`
                      : "Milestone decisions are not available yet."}
              </div>
            ) : null}
            <div className="tx-list" style={{ marginTop: 12 }}>
              {tx.milestones.map((milestone) => {
                const reviewDraft = milestoneReviewDrafts[milestone.id] ?? buildMilestoneReviewDraft(milestone);
                return (
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
                      {milestone.deadline ? (
                        <div className="muted" style={{ marginTop: 4 }}>
                          Deadline {formatHistoryDate(milestone.deadline)}
                        </div>
                      ) : null}
                    </div>
                    <div style={{ textAlign: "right", fontWeight: 700 }}>{formatCurrency(milestone.amount)}</div>
                  </div>
                  {milestone.changeRequestedAt && tx.isOwner ? (
                    <div className="milestone-review">
                      <div className="milestone-review__heading">
                        <strong>Review requested changes</strong>
                        <span className="muted">Edit the proposed values before accepting if needed.</span>
                      </div>
                      <div className="milestone-review__comparison">
                        <div className="milestone-review__original">
                          <div className="milestone-review__label">Before — original</div>
                          <strong>{milestone.title}</strong>
                          <div>{formatCurrency(milestone.amount)}</div>
                          <div>{milestone.deadline ? `Due ${formatHistoryDate(milestone.deadline)}` : "No deadline"}</div>
                          <div className="muted">{milestone.description || "No description"}</div>
                        </div>
                        <div className="milestone-review__proposed">
                          <div className="milestone-review__label">After — proposed</div>
                          <div className="form-field">
                            <label className="muted" htmlFor={`review-title-${milestone.id}`}>Milestone title</label>
                            <input
                              id={`review-title-${milestone.id}`}
                              value={reviewDraft.title}
                              onChange={(event) => updateMilestoneReviewDraft(milestone, { title: event.target.value })}
                            />
                          </div>
                          <div className="milestone-review__fields">
                            <div className="form-field">
                              <label className="muted" htmlFor={`review-amount-${milestone.id}`}>Amount</label>
                              <input
                                id={`review-amount-${milestone.id}`}
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={reviewDraft.amount}
                                onChange={(event) => updateMilestoneReviewDraft(milestone, { amount: event.target.value })}
                              />
                            </div>
                            <div className="form-field">
                              <label className="muted" htmlFor={`review-deadline-${milestone.id}`}>Deadline</label>
                              <input
                                id={`review-deadline-${milestone.id}`}
                                type="date"
                                value={reviewDraft.deadline}
                                onChange={(event) => updateMilestoneReviewDraft(milestone, { deadline: event.target.value })}
                              />
                            </div>
                          </div>
                          <div className="form-field">
                            <label className="muted" htmlFor={`review-description-${milestone.id}`}>Description</label>
                            <textarea
                              id={`review-description-${milestone.id}`}
                              rows={3}
                              value={reviewDraft.description}
                              onChange={(event) => updateMilestoneReviewDraft(milestone, { description: event.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                      {milestone.changeRequestNote ? (
                        <div className="milestone-review__note"><strong>Counterparty note:</strong> {milestone.changeRequestNote}</div>
                      ) : null}
                      <div className="milestone-review__actions">
                        <button
                          className="btn"
                          onClick={() => handleApplyMilestoneChanges(tx, milestone, "accept")}
                          disabled={applyMilestoneChangesMutation.isPending}
                        >
                          {applyMilestoneChangesMutation.isPending ? "Saving..." : "Accept reviewed changes"}
                        </button>
                        <button
                          className="ghost"
                          onClick={() => handleApplyMilestoneChanges(tx, milestone, "reject")}
                          disabled={applyMilestoneChangesMutation.isPending}
                        >
                          Keep original
                        </button>
                      </div>
                    </div>
                  ) : milestone.changeRequestedAt ? (
                    <div className="milestone-warning" style={{ marginTop: 10 }}>
                      <strong>Requested revision awaiting review</strong>
                      <div style={{ marginTop: 6 }}>{milestone.requestedTitle}</div>
                      <div className="muted">
                        {milestone.requestedAmount !== undefined ? formatCurrency(milestone.requestedAmount) : null}
                        {milestone.requestedDeadline ? ` • Due ${formatHistoryDate(milestone.requestedDeadline)}` : " • No deadline"}
                      </div>
                      {milestone.requestedDescription ? <div className="muted" style={{ marginTop: 4 }}>{milestone.requestedDescription}</div> : null}
                      {milestone.changeRequestNote ? <div style={{ marginTop: 6 }}>Note: {milestone.changeRequestNote}</div> : null}
                    </div>
                  ) : null}
                  {milestoneChangeDraft?.milestoneId === milestone.id ? (
                    <div className="card" style={{ marginTop: 10, padding: 12 }}>
                      <strong>Propose milestone changes</strong>
                      <div className="form-grid" style={{ marginTop: 10 }}>
                        <div className="form-field">
                          <label className="muted">Wording</label>
                          <input
                            value={milestoneChangeDraft.title}
                            onChange={(event) => setMilestoneChangeDraft((current) => current ? { ...current, title: event.target.value } : current)}
                          />
                        </div>
                        <div className="form-field">
                          <label className="muted">Cost</label>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={milestoneChangeDraft.amount}
                            onChange={(event) => setMilestoneChangeDraft((current) => current ? { ...current, amount: event.target.value } : current)}
                          />
                        </div>
                        <div className="form-field">
                          <label className="muted">Deadline</label>
                          <input
                            type="date"
                            value={milestoneChangeDraft.deadline}
                            onChange={(event) => setMilestoneChangeDraft((current) => current ? { ...current, deadline: event.target.value } : current)}
                          />
                        </div>
                      </div>
                      <div className="form-field" style={{ marginTop: 8 }}>
                        <label className="muted">Description</label>
                        <textarea
                          rows={2}
                          value={milestoneChangeDraft.description}
                          onChange={(event) => setMilestoneChangeDraft((current) => current ? { ...current, description: event.target.value } : current)}
                        />
                      </div>
                      <div className="form-field" style={{ marginTop: 8 }}>
                        <label className="muted">Reason or note</label>
                        <textarea
                          rows={2}
                          value={milestoneChangeDraft.note}
                          onChange={(event) => setMilestoneChangeDraft((current) => current ? { ...current, note: event.target.value } : current)}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button className="btn" onClick={() => handleRequestMilestoneChanges(tx)} disabled={requestMilestoneChangesMutation.isPending}>
                          {requestMilestoneChangesMutation.isPending ? "Sending..." : "Send request"}
                        </button>
                        <button className="ghost" onClick={() => setMilestoneChangeDraft(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : null}
                  <div className="milestone-actions">
                    {canApproveEscrow && milestone.status === "pending" ? (
                      <button className="ghost" onClick={() => beginMilestoneChangeRequest(milestone)}>
                        Request changes
                      </button>
                    ) : milestone.changeRequestedAt ? (
                      null
                    ) : milestone.status === "pending" ? (
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
                );
              })}
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
      <main ref={mainContentRef} className="app-main" tabIndex={-1}>
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
      {changePasswordOpen ? (
        <ChangePasswordModal onClose={() => setChangePasswordOpen(false)} />
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
