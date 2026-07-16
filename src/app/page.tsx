"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import {
  useApproveEscrow,
  useApproveMilestone,
  useApplyAgreementChanges,
  useCancelEscrow,
  type CreateEscrowResponse,
  useCreateEscrow,
  useDismissNotification,
  useFundEscrow,
  useRejectEscrow,
  useRejectMilestone,
  useRequestAgreementChanges,
  useResubmitMilestone,
  useUpdateDraftEscrow,
  useEscrowSummary,
  useEscrows,
  useNotificationHistory,
  useNotifications,
  useWalletTopup,
  useWalletTransactions,
  useWalletWithdraw,
  useBusinessProfile,
  type BusinessDetails,
  type PartyIdentity,
} from "@/hooks/useDashboardData";
import { useToast } from "@/components/ToastProvider";
import { useAuth } from "@/components/AuthProvider";
import { moveItem, sortByDeadline } from "@/lib/milestoneOrdering";
import { orderNotifications } from "@/lib/notificationOrdering";
import { latestNotificationSeenToken, notificationSeenStorageKey } from "@/lib/notificationSeen";
import {
  formatCurrencyInput,
  formatCurrencyValue as formatCurrency,
  normalizeCurrencyInput,
} from "@/lib/currencyInput";
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
  buyerParty?: PartyDisplay;
  sellerParty?: PartyDisplay;
  milestones: TxMilestone[];
  timeline: TimelineEntry[];
  counterpartyApproved: boolean;
};

type PartyDisplay = {
  partyType: "individual" | "business";
  representativeName?: string;
  representativeTitle?: string;
  registrationCountry?: string;
  registrationNumber?: string;
  registeredAddress?: string;
};

const emptyBusinessDetails = (): BusinessDetails => ({
  legalName: "",
  representativeTitle: "",
});

const businessDetailsComplete = (details: BusinessDetails) =>
  Object.values(details).every((value) => value.trim().length >= 2);

type DraftMilestone = {
  id: string;
  title: string;
  amount: number;
  description: string;
  deadline: string;
};

type AgreementChangeMilestoneDraft = {
  id: string;
  milestoneId?: string;
  title: string;
  description: string;
  amount: string;
  deadline: string;
  isNew?: boolean;
};

type AgreementChangeDraft = {
  milestones: AgreementChangeMilestoneDraft[];
  note: string;
};

type DraftEscrowEditMilestone = {
  id: string;
  title: string;
  description: string;
  amount: string;
  deadline: string;
};

type DraftEscrowEditDraft = {
  title: string;
  counterpartyEmail: string;
  amount: string;
  description: string;
  milestones: DraftEscrowEditMilestone[];
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

const buildDraftEscrowEditDraft = (tx: Transaction): DraftEscrowEditDraft => ({
  title: tx.title,
  counterpartyEmail: tx.creatorRole === "seller" ? tx.buyerEmail : tx.sellerEmail,
  amount: tx.amount.toString(),
  description: tx.description ?? "",
  milestones: tx.milestones.length
    ? tx.milestones.map((milestone) => ({
        id: randomId(),
        title: milestone.title,
        description: milestone.description ?? "",
        amount: milestone.amount.toString(),
        deadline: (milestone.deadline ?? "").slice(0, 10),
      }))
    : [
        {
          id: randomId(),
          title: tx.title,
          description: tx.description ?? "",
          amount: tx.amount.toString(),
          deadline: "",
        },
      ],
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

function EscrowWizardHeader({ currentStep, title, description }: {
  currentStep: 1 | 2 | 3;
  title: string;
  description: string;
}) {
  const steps = ["Details", "Milestones", "Agreement"];
  return (
    <div className="wizard-header">
      <div className="wizard-header__copy">
        <span className="wizard-header__eyebrow">Create escrow</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <ol className="wizard-progress" aria-label={`Step ${currentStep} of 3`}>
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const state = stepNumber < currentStep ? "complete" : stepNumber === currentStep ? "active" : "upcoming";
          return (
            <li key={step} data-status={state}>
              <span>{stepNumber < currentStep ? "✓" : stepNumber}</span>
              <strong>{step}</strong>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

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
    title: "Build and sign",
    detail: "Add the transaction details and milestones, then review and sign the agreement.",
  },
  {
    title: "Counterparty review",
    detail: "After you submit, we invite the other party to approve and sign or request changes.",
  },
  {
    title: "Buyer funds the escrow",
    detail: "Once both parties have signed, the buyer funds the escrow and milestone work can begin.",
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
  doc.roundedRect(margin, cursorY, contentWidth, 31, 2, 2, "F");
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
  if (tx.buyerParty?.partyType === "business") {
    doc.text(`Represented by ${tx.buyerParty.representativeName ?? "Authorized representative"}${tx.buyerParty.representativeTitle ? `, ${tx.buyerParty.representativeTitle}` : ""}`, margin + 5, cursorY + 20);
  }
  if (tx.sellerParty?.partyType === "business") {
    doc.text(`Represented by ${tx.sellerParty.representativeName ?? "Authorized representative"}${tx.sellerParty.representativeTitle ? `, ${tx.sellerParty.representativeTitle}` : ""}`, margin + contentWidth / 2 + 4, cursorY + 20);
  }
  doc.text(tx.buyerEmail, margin + 5, cursorY + 26);
  doc.text(tx.sellerEmail, margin + contentWidth / 2 + 4, cursorY + 26);
  cursorY += 42;

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
    tx.buyerParty?.representativeName ?? tx.buyer,
    tx.buyerEmail,
    tx.buyerSignatureDataUrl,
    buyerSigned,
    inferredCreatorRole === "buyer" ? creatorSignedAt : tx.approvedAt ?? approvalEvent?.time,
  );
  renderSignature(
    margin + signerWidth + 8,
    "Seller",
    tx.sellerParty?.representativeName ?? tx.seller,
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
    } else if (lifecycleStatus === "cancelled" || lifecycleStatus === "rejected") {
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
      buyerParty: {
        partyType: buyer.partyType ?? "individual",
        ...(buyer.representativeName ? { representativeName: buyer.representativeName } : {}),
        ...(buyer.representativeTitle ? { representativeTitle: buyer.representativeTitle } : {}),
        ...(buyer.registrationCountry ? { registrationCountry: buyer.registrationCountry } : {}),
        ...(buyer.registrationNumber ? { registrationNumber: buyer.registrationNumber } : {}),
        ...(buyer.registeredAddress ? { registeredAddress: buyer.registeredAddress } : {}),
      },
      sellerParty: {
        partyType: seller.partyType ?? "individual",
        ...(seller.representativeName ? { representativeName: seller.representativeName } : {}),
        ...(seller.representativeTitle ? { representativeTitle: seller.representativeTitle } : {}),
        ...(seller.registrationCountry ? { registrationCountry: seller.registrationCountry } : {}),
        ...(seller.registrationNumber ? { registrationNumber: seller.registrationNumber } : {}),
        ...(seller.registeredAddress ? { registeredAddress: seller.registeredAddress } : {}),
      },
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
  const [splashVisible, setSplashVisible] = useState(true);
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
    partyType: "individual" as "individual" | "business",
    business: emptyBusinessDetails(),
  });
  const [milestones, setMilestones] = useState<DraftMilestone[]>([]);
  const [milestoneInputs, setMilestoneInputs] = useState({ title: "", amount: "", description: "", deadline: "" });
  const milestoneDeadlineRef = useRef<HTMLInputElement | null>(null);
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [milestoneWarning, setMilestoneWarning] = useState<string | null>(null);
  const [milestoneReviewDrafts, setMilestoneReviewDrafts] = useState<Record<string, MilestoneReviewDraft>>({});
  const [agreementChangeDraft, setAgreementChangeDraft] = useState<AgreementChangeDraft | null>(null);
  const [draftEscrowEdit, setDraftEscrowEdit] = useState<DraftEscrowEditDraft | null>(null);
  const [agreementReviewMode, setAgreementReviewMode] = useState<"original" | "proposed">("proposed");
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [signatureCaptured, setSignatureCaptured] = useState(false);
  const [signatureVersion, setSignatureVersion] = useState(0);
  const signaturePadRef = useRef<SignaturePadHandle | null>(null);
  const [approvalSignatureCaptured, setApprovalSignatureCaptured] = useState(false);
  const [approvalSignatureVersion, setApprovalSignatureVersion] = useState(0);
  const approvalSignaturePadRef = useRef<SignaturePadHandle | null>(null);
  const [approvalPartyType, setApprovalPartyType] = useState<"individual" | "business">("individual");
  const [approvalBusiness, setApprovalBusiness] = useState<BusinessDetails>(emptyBusinessDetails);
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
  const [seenNotificationToken, setSeenNotificationToken] = useState("");

  const createEscrowMutation = useCreateEscrow();
  const businessProfileQuery = useBusinessProfile();
  const dismissNotificationMutation = useDismissNotification();
  const approveEscrowMutation = useApproveEscrow();
  const approveMilestoneMutation = useApproveMilestone();
  const rejectEscrowMutation = useRejectEscrow();
  const rejectMilestoneMutation = useRejectMilestone();
  const requestAgreementChangesMutation = useRequestAgreementChanges();
  const applyAgreementChangesMutation = useApplyAgreementChanges();
  const updateDraftEscrowMutation = useUpdateDraftEscrow();
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

  const pendingCard = displayTransactions.find((tx) =>
    tx.status === "Pending" && !["rejected", "cancelled"].includes(tx.lifecycleStatus ?? ""),
  );

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
  const orderedNotifications = orderNotifications(notificationsToRender, requiresCurrentUserAction);
  const latestAlertToken = latestNotificationSeenToken(orderedNotifications);
  const hasUnreadNotifications = Boolean(latestAlertToken && seenNotificationToken !== latestAlertToken);

  const handleDismissNotification = (notificationId: string) => {
    void dismissNotificationMutation.mutateAsync(notificationId).catch((error) => {
      pushToast({
        variant: "error",
        title: error instanceof Error ? error.message : "Unable to dismiss notification.",
      });
    });
  };
  const openNotifications = orderedNotifications.length;

  const markAlertsSeen = () => {
    if (!latestAlertToken) return;
    setSeenNotificationToken(latestAlertToken);
    window.localStorage.setItem(notificationSeenStorageKey(profileIdentity.id), latestAlertToken);
  };

useEffect(() => {
  const timeoutId = window.setTimeout(() => setSplashVisible(false), 1400);
  return () => window.clearTimeout(timeoutId);
}, []);

useEffect(() => {
  if (notificationsQuery.isError) {
    pushToast({
      variant: "error",
      title: "Notifications failed to load.",
    });
  }
}, [notificationsQuery.isError, pushToast]);

useEffect(() => {
  setSeenNotificationToken(window.localStorage.getItem(notificationSeenStorageKey(profileIdentity.id)) ?? "");
}, [profileIdentity.id]);

useEffect(() => {
  if (notificationsPanelOpen) {
    markAlertsSeen();
  }
}, [notificationsPanelOpen, latestAlertToken]);

useEffect(() => {
  if (!isHydrating && !isAuthenticated) {
    router.replace("/login");
  }
}, [isHydrating, isAuthenticated, router]);

  const milestoneTotal = useMemo(
    () => milestones.reduce((sum, item) => sum + item.amount, 0),
    [milestones],
  );

const agreementPreview = (() => {
  const amountValue = Number(createForm.amount) || 0;
  const descriptionValue = createForm.description.trim();
  const descriptionLine = descriptionValue ? `\nDescription: ${descriptionValue}` : "";
  const creatorLabel = createForm.partyType === "business"
    ? `${createForm.business.legalName || "Business pending"}, represented by ${currentUser.name}${createForm.business.representativeTitle ? `, ${createForm.business.representativeTitle}` : ""}`
    : currentUser.name;
  const intro = `Buyer: ${createForm.role === "buyer" ? creatorLabel : createForm.counterpartyEmail || "Buyer pending"}\nSeller: ${
    createForm.role === "seller" ? creatorLabel : createForm.counterpartyEmail || "Seller pending"
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
})();

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
    if (createForm.partyType === "business" && !businessDetailsComplete(createForm.business)) {
      setMessage("Enter the Business Name and Your Title before continuing.");
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
        creatorParty: createForm.partyType === "business"
          ? { type: "business", business: createForm.business }
          : { type: "individual" },
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
      const creatorDisplayName = createForm.partyType === "business" ? createForm.business.legalName : currentUser.name;
      const buyerInfo =
        createForm.role === "buyer"
          ? { name: creatorDisplayName, email: currentUser.email }
          : { name: counterpartyName, email: createForm.counterpartyEmail };
      const sellerInfo =
        createForm.role === "seller"
          ? { name: creatorDisplayName, email: currentUser.email }
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
        buyerParty: createForm.role === "buyer"
          ? { partyType: createForm.partyType, ...(createForm.partyType === "business" ? {
              representativeName: currentUser.name,
              representativeTitle: createForm.business.representativeTitle,
            } : {}) }
          : { partyType: "individual" },
        sellerParty: createForm.role === "seller"
          ? { partyType: createForm.partyType, ...(createForm.partyType === "business" ? {
              representativeName: currentUser.name,
              representativeTitle: createForm.business.representativeTitle,
            } : {}) }
          : { partyType: "individual" },
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
        partyType: "individual",
        business: emptyBusinessDetails(),
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

  const agreementDraftTotal = (draft: AgreementChangeDraft) =>
    draft.milestones.reduce((total, milestone) => total + (Number(milestone.amount) || 0), 0);

  const draftEscrowEditTotal = (draft: DraftEscrowEditDraft) =>
    draft.milestones.reduce((total, milestone) => total + (Number(milestone.amount) || 0), 0);

  const beginDraftEscrowEdit = (tx: Transaction) => {
    setDraftEscrowEdit(buildDraftEscrowEditDraft(tx));
  };

  const updateDraftEscrowEdit = (updates: Partial<DraftEscrowEditDraft>) => {
    setDraftEscrowEdit((current) => (current ? { ...current, ...updates } : current));
  };

  const updateDraftEscrowMilestone = (
    draftId: string,
    updates: Partial<DraftEscrowEditMilestone>,
  ) => {
    setDraftEscrowEdit((current) =>
      current
        ? {
            ...current,
            milestones: current.milestones.map((milestone) =>
              milestone.id === draftId ? { ...milestone, ...updates } : milestone,
            ),
          }
        : current,
    );
  };

  const addDraftEscrowMilestone = () => {
    setDraftEscrowEdit((current) =>
      current
        ? {
            ...current,
            milestones: [
              ...current.milestones,
              { id: randomId(), title: "", description: "", amount: "", deadline: "" },
            ],
          }
        : current,
    );
  };

  const removeDraftEscrowMilestone = (draftId: string) => {
    setDraftEscrowEdit((current) =>
      current
        ? { ...current, milestones: current.milestones.filter((milestone) => milestone.id !== draftId) }
        : current,
    );
  };

  const handleUpdateDraftEscrow = async (tx: Transaction) => {
    if (!draftEscrowEdit) return;
    const amount = Number(draftEscrowEdit.amount);
    if (!draftEscrowEdit.title.trim() || !draftEscrowEdit.counterpartyEmail.trim() || !Number.isFinite(amount) || amount <= 0) {
      setMessage("Title, counterparty email, and amount are required.");
      return;
    }
    const invalidMilestone = draftEscrowEdit.milestones.find(
      (milestone) => !milestone.title.trim() || !Number.isFinite(Number(milestone.amount)) || Number(milestone.amount) <= 0,
    );
    if (invalidMilestone) {
      setMessage("Every milestone needs a title and valid amount.");
      return;
    }
    const total = draftEscrowEditTotal(draftEscrowEdit);
    if (Math.round(total * 100) !== Math.round(amount * 100)) {
      setMessage(`Milestone amounts must add up to the escrow amount of ${formatCurrency(amount)}.`);
      return;
    }
    const escrowId = tx.reference ?? `PO-${tx.id}`;
    try {
      await updateDraftEscrowMutation.mutateAsync({
        escrowId,
        title: draftEscrowEdit.title.trim(),
        counterpartyEmail: draftEscrowEdit.counterpartyEmail.trim(),
        amount,
        description: draftEscrowEdit.description.trim() || undefined,
        milestones: draftEscrowEdit.milestones.map((milestone) => ({
          title: milestone.title.trim(),
          description: milestone.description.trim() || undefined,
          amount: Number(milestone.amount),
          deadline: milestone.deadline
            ? new Date(`${milestone.deadline}T00:00:00.000Z`).toISOString()
            : undefined,
        })),
      });
      setDraftEscrowEdit(null);
      setMessage("Draft escrow updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update the draft escrow.");
    }
  };

  const buildAgreementChangeDraft = (tx: Transaction): AgreementChangeDraft => ({
    milestones: tx.milestones
      .filter((milestone) => milestone.status === "pending")
      .map((milestone) => ({
        id: milestone.id,
        ...(milestone.amount === 0 && milestone.changeRequestedAt ? {} : { milestoneId: milestone.id }),
        title: milestone.requestedTitle ?? milestone.title,
        description: milestone.requestedDescription ?? milestone.description ?? "",
        amount: (milestone.requestedAmount ?? milestone.amount).toString(),
        deadline: (milestone.requestedDeadline ?? milestone.deadline ?? "").slice(0, 10),
        isNew: milestone.amount === 0 && Boolean(milestone.changeRequestedAt),
      })),
    note: "",
  });

  const beginAgreementChangeRequest = (tx: Transaction) => {
    setAgreementChangeDraft(buildAgreementChangeDraft(tx));
  };

  const updateAgreementChangeMilestone = (
    draftId: string,
    updates: Partial<AgreementChangeMilestoneDraft>,
  ) => {
    setAgreementChangeDraft((current) =>
      current
        ? {
            ...current,
            milestones: current.milestones.map((milestone) =>
              milestone.id === draftId ? { ...milestone, ...updates } : milestone,
            ),
          }
        : current,
    );
  };

  const addAgreementChangeMilestone = () => {
    setAgreementChangeDraft((current) =>
      current
        ? {
            ...current,
            milestones: [
              ...current.milestones,
              {
                id: randomId(),
                title: "",
                description: "",
                amount: "",
                deadline: "",
                isNew: true,
              },
            ],
          }
        : current,
    );
  };

  const handleRequestAgreementChanges = async (tx: Transaction) => {
    if (!agreementChangeDraft) return;
    const invalidMilestone = agreementChangeDraft.milestones.find(
      (milestone) => !milestone.title.trim() || !Number.isFinite(Number(milestone.amount)) || Number(milestone.amount) <= 0,
    );
    if (invalidMilestone) {
      setMessage("Every milestone needs a title and valid amount.");
      return;
    }
    const total = agreementDraftTotal(agreementChangeDraft);
    if (Math.round(total * 100) !== Math.round(tx.amount * 100)) {
      const difference = total - tx.amount;
      setMessage(
        difference > 0
          ? `Milestone amounts exceed the escrow amount by ${formatCurrency(difference)}. Reduce one or more milestone amounts so the total equals ${formatCurrency(tx.amount)}.`
          : `Milestone amounts are short by ${formatCurrency(Math.abs(difference))}. Increase one or more milestone amounts so the total equals ${formatCurrency(tx.amount)}.`,
      );
      return;
    }
    const escrowId = tx.reference ?? `PO-${tx.id}`;
    try {
      await requestAgreementChangesMutation.mutateAsync({
        escrowId,
        milestones: agreementChangeDraft.milestones.map((milestone) => ({
          ...(milestone.milestoneId ? { milestoneId: milestone.milestoneId } : {}),
          title: milestone.title.trim(),
          description: milestone.description.trim() || undefined,
          amount: Number(milestone.amount),
          deadline: milestone.deadline
            ? new Date(`${milestone.deadline}T00:00:00.000Z`).toISOString()
            : undefined,
        })),
        note: agreementChangeDraft.note.trim() || undefined,
      });
      setAgreementChangeDraft(null);
      setMessage("Requested agreement changes sent to the escrow creator.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to request agreement changes.");
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

  const handleApplyAgreementChanges = async (tx: Transaction, decision: "accept" | "reject") => {
    const escrowId = tx.reference ?? `PO-${tx.id}`;
    const requestedMilestones = tx.milestones.filter((milestone) => milestone.changeRequestedAt);
    const reviewMilestones = requestedMilestones.map((milestone) => {
      const reviewDraft = milestoneReviewDrafts[milestone.id] ?? buildMilestoneReviewDraft(milestone);
      return {
        milestoneId: milestone.id,
        title: reviewDraft.title.trim(),
        description: reviewDraft.description.trim() || undefined,
        amount: Number(reviewDraft.amount),
        deadline: reviewDraft.deadline
          ? new Date(`${reviewDraft.deadline}T00:00:00.000Z`).toISOString()
          : undefined,
      };
    });
    if (decision === "accept") {
      const invalidMilestone = reviewMilestones.find(
        (milestone) => !milestone.title || !Number.isFinite(milestone.amount) || milestone.amount <= 0,
      );
      if (invalidMilestone) {
        setMessage("Every proposed milestone needs a title and valid amount.");
        return;
      }
      const total = reviewMilestones.reduce((sum, milestone) => sum + milestone.amount, 0);
      if (Math.round(total * 100) !== Math.round(tx.amount * 100)) {
        setMessage(`Milestone amounts must add up to the escrow amount of ${formatCurrency(tx.amount)}.`);
        return;
      }
    }
    try {
      await applyAgreementChangesMutation.mutateAsync({
        escrowId,
        decision,
        ...(decision === "accept" ? { milestones: reviewMilestones } : {}),
      });
      setMilestoneReviewDrafts({});
      setMessage(
        decision === "accept"
          ? "The reviewed agreement changes were accepted and saved."
          : "The requested agreement changes were declined and the original agreement was kept.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to complete the agreement review.");
    }
  };

  const handleApproveEscrow = async (tx: Transaction) => {
    const escrowId = tx.reference ?? `PO-${tx.id}`;
    const signatureDataUrl = approvalSignaturePadRef.current?.getDataUrl();
    if (!signatureDataUrl) {
      setMessage("Draw your signature before approving the agreement.");
      return;
    }
    if (approvalPartyType === "business" && !businessDetailsComplete(approvalBusiness)) {
      setMessage("Enter the Business Name and Your Title before approving the escrow.");
      return;
    }
    const counterpartyParty: PartyIdentity = approvalPartyType === "business"
      ? { type: "business", business: approvalBusiness }
      : { type: "individual" };
    try {
      await approveEscrowMutation.mutateAsync({ escrowId, signatureDataUrl, counterpartyParty });
      approvalSignaturePadRef.current?.clear();
      setApprovalSignatureCaptured(false);
      setApprovalSignatureVersion((version) => version + 1);
      setApprovalPartyType("individual");
      setApprovalBusiness(emptyBusinessDetails());
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
        markAlertsSeen();
        void notificationsQuery.refetch();
      }
      return next;
    });
  };

  const showAlertsPanel = () => {
    if (!notificationsPanelOpen) {
      markAlertsSeen();
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
      body: "Link a bank account to deposit funds into and withdraw funds from your MyEscrow wallet.",
    });

  const closeModal = () => setModalContent(null);

  const renderWelcome = () => (
    <section className="screen active home-screen">
      <div className="home-hero">
        <div className="home-hero__content">
          <p className="home-hero__eyebrow">
            <span aria-hidden="true">●</span> Secure transactions, made simple
          </p>
          <h2 className="home-hero__title">
            Welcome back, <span>{greetingName}</span>
          </h2>
          <p className="home-hero__lead">
            Create an agreement, protect the payment, and release funds only when the work is done.
          </p>
          <div className="home-actions">
            <button className="btn home-primary-action" onClick={() => navigate("create")}>
              Create an escrow <span aria-hidden="true">→</span>
            </button>
            <button className="home-text-action" onClick={() => navigate("dashboard")}>
              Open dashboard
            </button>
          </div>
        </div>
        <div className="home-hero__visual" aria-hidden="true">
          <div className="home-orbit home-orbit--outer" />
          <div className="home-orbit home-orbit--inner" />
          <div className="home-shield">
            <svg viewBox="0 0 64 72" role="presentation">
              <path d="M32 3 57 13v19c0 17-10.5 29.5-25 36C17.5 61.5 7 49 7 32V13L32 3Z" />
              <path d="m21 35 7 7 15-17" />
            </svg>
          </div>
          <span className="home-float-pill home-float-pill--top">Agreement signed</span>
          <span className="home-float-pill home-float-pill--bottom">Funds protected</span>
        </div>
      </div>
      <div className="home-stack">
        {pendingCard ? (
          <div className="card alert-card home-next-action">
            <div className="home-next-action__heading">
              <div>
                <div className="alert-pill">Your next action</div>
                <h3>{pendingCard.title}</h3>
                <p>{pendingCard.context} · {pendingCard.counterpart}</p>
              </div>
              <button className="ghost" onClick={() => viewTransaction(pendingCard)}>
                Review escrow <span aria-hidden="true">→</span>
              </button>
            </div>
            <div className="home-progress" aria-label="Escrow progress">
              {pendingCard.steps.map((step) => (
                <div key={step.title} className="home-progress__step" data-status={step.status}>
                  <span className="home-progress__dot" />
                  <span>{step.title}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card home-empty-state home-next-action">
            <span className="home-empty-state__icon" aria-hidden="true">✓</span>
            <div>
              <strong>You’re all caught up</strong>
              <p>No escrows need your attention right now.</p>
            </div>
          </div>
        )}
      </div>

      <div className="home-how">
        <div className="home-section-heading">
          <p className="auth-eyebrow">How it works</p>
          <h3>Confidence at every step</h3>
        </div>
        <div className="home-how__steps">
          {[
            ["01", "Agree", "Set clear terms, milestones, and delivery expectations."],
            ["02", "Protect", "Funds are held securely while the work moves forward."],
            ["03", "Release", "Approve completed work and release payment with confidence."],
          ].map(([number, title, detail]) => (
            <div className="home-how__step" key={number}>
              <span>{number}</span>
              <h4>{title}</h4>
              <p>{detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="home-trust" aria-label="MyEscrow benefits">
        <span>Protected funds</span>
        <span>Transparent milestones</span>
        <span>Secure agreements</span>
      </div>
    </section>
  );

  const renderDashboard = () => (
    <section className="screen active dashboard-screen app-content-page">
      <div className="compact-page-header">
        <div>
          <p className="compact-page-header__eyebrow">Your workspace</p>
          <h2>Dashboard</h2>
          <p>Overview of your transactions and quick actions.</p>
        </div>
      </div>
      <div className="tiles">
        <div className="tile alerts-tile">
          <div className="t-title">Alerts</div>
          <div className="muted">Open items</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{openNotifications}</div>
          <button className="ghost alerts-tile__details-button" type="button" onClick={showAlertsPanel}>
            View details
          </button>
          <details className="alerts-history">
            <summary>
              <span>Alert history</span>
              <span className="muted">{timelineEntries.length}</span>
            </summary>
            <div className="alerts-history__list">
              {timelineEntries.length === 0 ? (
                <div className="muted">No alert history yet for this account.</div>
              ) : (
                timelineEntries.map((event) => (
                  <button
                    key={event.id}
                    className="alerts-history__item"
                    type="button"
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
                    <span className="alerts-history__label">{event.label}</span>
                    <span className="muted">{event.detail}</span>
                    {"createdAt" in event && event.createdAt ? (
                      <span className="muted">
                        <NotificationTimestamp createdAt={event.createdAt} />
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </details>
        </div>
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
      <div className="card dashboard-transactions" style={{ marginBottom: 12 }}>
        <div className="section-title-row">
          <div><span>Portfolio</span><strong>Transactions</strong></div>
          <span>{displayTransactions.length} total</span>
        </div>
        <div
          className="tx-list dashboard-transactions__list"
          role="region"
          aria-label="Transactions list"
          tabIndex={0}
        >
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
    </section>
  );

  const renderCreate = () => {
    const counterpartLabel = createForm.role === "buyer" ? "Seller" : "Buyer";

    return (
      <section className="screen active create-flow wizard-screen">
        <EscrowWizardHeader currentStep={1} title="Create a new transaction" description="Set the foundation for a secure agreement." />
        <div className="create-flow__hero create-flow__intro">
          <div className="lead create-flow__lead">
            <p style={{ margin: 0 }}>
              After you submit, we&apos;ll invite the counterparty to review and sign. Once both parties have
              signed, the buyer funds the escrow.
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
              <div className="muted create-form-label">You are creating this escrow as</div>
              <div className="role-toggle create-form-role">
                {(["individual", "business"] as const).map((partyType) => (
                  <label
                    key={partyType}
                    className={`role-option ${createForm.partyType === partyType ? "active" : ""}`}
                    onClick={() => setCreateForm((current) => ({
                      ...current,
                      partyType,
                      business: partyType === "business" && businessProfileQuery.data?.businessProfile && !Object.values(current.business).some((value) => value.trim())
                        ? businessProfileQuery.data.businessProfile
                        : current.business,
                    }))}
                  >
                    <input type="radio" name="creator-party-type" checked={createForm.partyType === partyType} readOnly />
                    <span className="role-copy">{partyType === "individual" ? "Myself" : "A business"}</span>
                  </label>
                ))}
              </div>
              {createForm.partyType === "business" ? (
                <div className="business-identity-fields">
                  <div className="form-field">
                    <label className="muted">Business Name</label>
                    <input value={createForm.business.legalName} onChange={(event) => setCreateForm((current) => ({ ...current, business: { ...current.business, legalName: event.target.value } }))} />
                  </div>
                  <div className="form-field">
                    <label className="muted">Your Title</label>
                    <input value={createForm.business.representativeTitle} placeholder="Director, owner, officer…" onChange={(event) => setCreateForm((current) => ({ ...current, business: { ...current.business, representativeTitle: event.target.value } }))} />
                  </div>
                </div>
              ) : null}
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
    const draftMilestoneAmount = Number(milestoneInputs.amount) || 0;
    const escrowAmountCents = Math.round(escrowAmount * 100);
    const milestoneTotalCents = milestones.reduce((sum, milestone) => sum + Math.round(milestone.amount * 100), 0);
    const draftMilestoneAmountCents = Math.round(draftMilestoneAmount * 100);
    const remainingEscrowAmount = (escrowAmountCents - milestoneTotalCents - draftMilestoneAmountCents) / 100;
    const hasDraftMilestoneAmount = draftMilestoneAmountCents > 0;
    const addMilestoneDisabled = !editingMilestoneId
      && (remainingEscrowAmount < 0 || (remainingEscrowAmount === 0 && !hasDraftMilestoneAmount));

    return (
      <section className="screen active wizard-screen">
        <EscrowWizardHeader currentStep={2} title="Build the milestones" description="Break the agreement into clear, reviewable deliverables." />
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
                type="text"
                inputMode="decimal"
                value={formatCurrencyInput(milestoneInputs.amount)}
                placeholder="$0.00"
                onChange={(event) =>
                  setMilestoneInputs((prev) => ({ ...prev, amount: normalizeCurrencyInput(event.target.value) }))
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
          <output
            className="milestone-target__remaining"
            data-overdrawn={remainingEscrowAmount < 0}
            data-complete={remainingEscrowAmount === 0}
            aria-label="Remaining escrow amount"
          >
            <span>Remaining escrow amount</span>
            <strong>
              {formatCurrency(remainingEscrowAmount)}
              {remainingEscrowAmount === 0 ? <span aria-hidden="true"> ✓</span> : null}
            </strong>
          </output>
          <button
            type="button"
            className="ghost"
            onClick={handleAddMilestone}
            disabled={addMilestoneDisabled}
          >
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
            <button className="ghost" onClick={() => navigate("welcome")}>
              Cancel
            </button>
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
    <section className="screen active wizard-screen agreement-screen">
      <EscrowWizardHeader currentStep={3} title="Review and sign" description="Confirm the terms before sending the agreement." />
      <p className="muted wizard-helper-copy">
        Funding happens after both parties agree to the terms, so no deposits are needed right now.
      </p>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="form-field">
          <label className="muted">Agreement preview</label>
          <div className="agreement-preview-text">{agreementPreview}</div>
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
    <section className="screen active wallet-screen app-content-page">
      <div className="compact-page-header"><div><p className="compact-page-header__eyebrow">Funds</p><h2>Wallet</h2><p>Track deposits and withdrawals.</p></div></div>
      <div className="card wallet-card">
        <div className="muted">Available balance</div>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{formatCurrency(walletBalanceDisplay)}</div>
        <label className="muted" htmlFor="wallet-amount" style={{ marginTop: 8 }}>
          Top-up (mock)
        </label>
        <input
          id="wallet-amount"
          type="text"
          inputMode="decimal"
          value={formatCurrencyInput(walletAmountInput)}
          placeholder="$0.00"
          onChange={(event) => setWalletAmountInput(normalizeCurrencyInput(event.target.value))}
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
    <section className="screen active app-content-page collection-screen">
      <div className="compact-page-header"><div><p className="compact-page-header__eyebrow">Archive</p><h2>History</h2><p>Past escrows and payouts.</p></div></div>
      <div className="card">
        {displayTransactions
          .filter((tx) => tx.status === "Complete")
          .map((tx) => (
            <button
              key={tx.id}
              type="button"
              className="tx-item tx-item-button"
              onClick={() => viewTransaction(tx)}
              aria-label={`View transaction ${tx.title}`}
            >
              <div>
                <strong>{tx.title}</strong>
                <div className="muted">{tx.counterpart}</div>
              </div>
              <div>{formatCurrency(tx.amount)}</div>
            </button>
          ))}
      </div>
    </section>
  );

  const renderEscrows = () => {
    const activeTransactions = displayTransactions.filter((tx) => tx.status === "Active");
    return (
      <section className="screen active app-content-page collection-screen">
        <div className="compact-page-header"><div><p className="compact-page-header__eyebrow">In progress</p><h2>Active escrows</h2><p>Track milestones that can release funds.</p></div></div>
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
    <section className="screen active settings-screen app-content-page">
      <div className="compact-page-header"><div><p className="compact-page-header__eyebrow">Account</p><h2>Settings</h2><p>Manage profile, security, and payout settings.</p></div></div>
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
          <span className="settings-card__icon" aria-hidden="true">✓</span>
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>Security</h3>
          <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
            Update your password to keep your account protected.
          </p>
          <button className="btn" onClick={openSecurityModal}>
            Change password
          </button>
        </div>
        <div className="card">
          <span className="settings-card__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" role="presentation">
              <path d="M3 9h18L12 3 3 9Z" />
              <path d="M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3 21h18M3 17h18" />
            </svg>
          </span>
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>Bank accounts</h3>
          <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
            Link a bank account to deposit funds into and withdraw funds from your wallet.
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
        <section className="screen active transaction-screen app-content-page">
          <div className="compact-page-header"><div><p className="compact-page-header__eyebrow">Escrow details</p><h2>Transaction</h2></div></div>
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
    const canRequestMilestoneChanges = !tx.isOwner && (isAwaitingApproval || isChangesRequested);
    const canFundEscrow = isCurrentUserBuyer && isAwaitingFunding;
    const walletShortfall = Math.max(tx.amount - walletBalanceDisplay, 0);
    const requestedAgreementMilestones = tx.milestones.filter((milestone) => milestone.changeRequestedAt);
    const hasAgreementChangeRequest = requestedAgreementMilestones.length > 0;
    const proposedAgreementTotal = requestedAgreementMilestones.reduce(
      (sum, milestone) => sum + (milestone.requestedAmount ?? milestone.amount),
      0,
    );
    const draftAgreementTotal = agreementChangeDraft ? agreementDraftTotal(agreementChangeDraft) : 0;
    const draftAgreementRemaining = tx.amount - draftAgreementTotal;
    const hasNewAgreementMilestone = Boolean(agreementChangeDraft?.milestones.some((milestone) => milestone.isNew));
    const agreementDraftReady = Boolean(
      agreementChangeDraft &&
        agreementChangeDraft.milestones.every(
          (milestone) =>
            milestone.title.trim() &&
            Number.isFinite(Number(milestone.amount)) &&
            Number(milestone.amount) > 0,
        ) &&
        Math.round(draftAgreementTotal * 100) === Math.round(tx.amount * 100),
    );
    const agreementSubmitLabel = hasNewAgreementMilestone ? "Add milestone to agreement" : "Send agreement request";
    const canCancelEscrow =
      Boolean(tx.isOwner) &&
      tx.status !== "Cancelled" &&
      tx.status !== "Complete" &&
      (isAwaitingSignup || isAwaitingApproval || isChangesRequested);
    const canEditDraftEscrow = Boolean(tx.isOwner) && isAwaitingSignup;
    const draftEditTotal = draftEscrowEdit ? draftEscrowEditTotal(draftEscrowEdit) : 0;
    const draftEditAmount = draftEscrowEdit ? Number(draftEscrowEdit.amount) || 0 : 0;
    return (
      <section className="screen active transaction-screen app-content-page">
        <div className="compact-page-header"><div><p className="compact-page-header__eyebrow">Escrow details</p><h2>Transaction</h2></div></div>
        <div className="card transaction-hero-card">
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
          <div className="transaction-overview">
            <div className="transaction-parties">
              <div className="muted">Buyer</div>
              <div style={{ fontWeight: 700 }}>{tx.buyer}</div>
              {tx.buyerParty?.partyType === "business" ? (
                <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
                  Represented by {tx.buyerParty.representativeName}{tx.buyerParty.representativeTitle ? `, ${tx.buyerParty.representativeTitle}` : ""}
                </div>
              ) : null}
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {tx.buyerEmail}
              </div>
              <div className="muted" style={{ marginTop: 12 }}>
                Seller
              </div>
              <div style={{ fontWeight: 700 }}>{tx.seller}</div>
              {tx.sellerParty?.partyType === "business" ? (
                <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
                  Represented by {tx.sellerParty.representativeName}{tx.sellerParty.representativeTitle ? `, ${tx.sellerParty.representativeTitle}` : ""}
                </div>
              ) : null}
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {tx.sellerEmail}
              </div>
            </div>
            <div className="transaction-financial-summary">
              <div className="transaction-summary-field">
                <div className="muted">Amount</div>
                <div style={{ fontWeight: 700 }}>{formatCurrency(tx.amount)}</div>
              </div>
              <div className="transaction-summary-field">
                <div className="muted">Status</div>
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
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12, textAlign: "right" }}>
            <button
              className="ghost agreement-download-button"
              onClick={() => {
                if (tx.counterpartyApproved) downloadAgreementPdf(tx);
              }}
              disabled={!tx.counterpartyApproved}
              title={tx.counterpartyApproved ? undefined : "Available after counterparty approval"}
            >
              Download agreement (PDF)
            </button>
          </div>
        </div>
        {(canFundEscrow || canCancelEscrow || canEditDraftEscrow || (tx.isOwner && isChangesRequested)) ? (
          <div className="card" style={{ marginTop: 12 }}>
            <strong>Next step</strong>
            <p className="muted" style={{ marginTop: 8, marginBottom: 12 }}>
              {tx.isOwner && isChangesRequested
                  ? "Review the requested agreement changes below."
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
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
              {canEditDraftEscrow && !draftEscrowEdit ? (
                <button className="ghost" onClick={() => beginDraftEscrowEdit(tx)}>
                  Edit draft
                </button>
              ) : null}
            </div>
            {canEditDraftEscrow && draftEscrowEdit ? (
              <div className="agreement-change-card" style={{ marginTop: 14 }}>
                <div className="agreement-change-card__heading">
                  <div>
                    <strong>Edit draft escrow</strong>
                    <p className="muted" style={{ margin: "4px 0 0" }}>
                      Update this agreement before the counterparty joins.
                    </p>
                  </div>
                </div>
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <div className="form-field">
                    <label className="muted">Title</label>
                    <input
                      value={draftEscrowEdit.title}
                      onChange={(event) => updateDraftEscrowEdit({ title: event.target.value })}
                    />
                  </div>
                  <div className="form-field">
                    <label className="muted">Counterparty email</label>
                    <input
                      type="email"
                      value={draftEscrowEdit.counterpartyEmail}
                      onChange={(event) => updateDraftEscrowEdit({ counterpartyEmail: event.target.value })}
                    />
                  </div>
                  <div className="form-field">
                    <label className="muted">Amount</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formatCurrencyInput(draftEscrowEdit.amount)}
                      placeholder="$0.00"
                      onChange={(event) => updateDraftEscrowEdit({ amount: normalizeCurrencyInput(event.target.value) })}
                    />
                  </div>
                </div>
                <div className="form-field" style={{ marginTop: 10 }}>
                  <label className="muted">Description</label>
                  <textarea
                    rows={3}
                    value={draftEscrowEdit.description}
                    onChange={(event) => updateDraftEscrowEdit({ description: event.target.value })}
                  />
                </div>
                <div className="milestone-target" style={{ marginTop: 12 }}>
                  <div>
                    <div className="milestone-target__label">Escrow amount</div>
                    <div className="milestone-target__sub">Milestone totals must match this amount.</div>
                  </div>
                  <div className="milestone-target__totals">
                    <div className="milestone-target__value">{formatCurrency(draftEditAmount)}</div>
                    <div
                      className="milestone-target__remaining"
                      data-overdrawn={Math.round(draftEditTotal * 100) !== Math.round(draftEditAmount * 100)}
                      data-complete={Math.round(draftEditTotal * 100) === Math.round(draftEditAmount * 100)}
                    >
                      <span>Milestone total</span>
                      <strong>{formatCurrency(draftEditTotal)}</strong>
                    </div>
                  </div>
                </div>
                <div className="agreement-change-list">
                  {draftEscrowEdit.milestones.map((milestone, index) => (
                    <div key={milestone.id} className="agreement-change-row">
                      <div className="agreement-change-row__title">
                        <strong>Milestone {index + 1}</strong>
                        {draftEscrowEdit.milestones.length > 1 ? (
                          <button className="ghost" onClick={() => removeDraftEscrowMilestone(milestone.id)}>
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <div className="form-grid">
                        <div className="form-field">
                          <label className="muted">Title</label>
                          <input
                            value={milestone.title}
                            onChange={(event) => updateDraftEscrowMilestone(milestone.id, { title: event.target.value })}
                          />
                        </div>
                        <div className="form-field">
                          <label className="muted">Amount</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={formatCurrencyInput(milestone.amount)}
                            placeholder="$0.00"
                            onChange={(event) => updateDraftEscrowMilestone(milestone.id, { amount: normalizeCurrencyInput(event.target.value) })}
                          />
                        </div>
                        <div className="form-field">
                          <label className="muted">Deadline</label>
                          <input
                            type="date"
                            value={milestone.deadline}
                            onChange={(event) => updateDraftEscrowMilestone(milestone.id, { deadline: event.target.value })}
                          />
                        </div>
                      </div>
                      <div className="form-field" style={{ marginTop: 8 }}>
                        <label className="muted">Description</label>
                        <textarea
                          rows={3}
                          value={milestone.description}
                          onChange={(event) => updateDraftEscrowMilestone(milestone.id, { description: event.target.value })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <button className="ghost" style={{ marginTop: 10 }} onClick={addDraftEscrowMilestone}>
                  Add milestone
                </button>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button className="btn" onClick={() => handleUpdateDraftEscrow(tx)} disabled={updateDraftEscrowMutation.isPending}>
                    {updateDraftEscrowMutation.isPending ? "Saving..." : "Save draft"}
                  </button>
                  <button className="ghost" onClick={() => setDraftEscrowEdit(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {(isAwaitingApproval || isChangesRequested) &&
        tx.milestones.length &&
        !(canRequestMilestoneChanges && agreementChangeDraft) &&
        !(tx.isOwner && isChangesRequested && hasAgreementChangeRequest) ? (
          <div className="card" style={{ marginTop: 12 }}>
            <strong>Agreement milestones</strong>
            <div className="tx-list" style={{ marginTop: 12 }}>
              {tx.milestones
                .filter((milestone) => milestone.amount > 0 || !milestone.changeRequestedAt)
                .map((milestone) => (
                  <div key={milestone.id} className="tx-item milestone-entry">
                    <div className="milestone-entry__top">
                      <div>
                        <strong>{milestone.title}</strong>
                        {milestone.description ? (
                          <p className="muted" style={{ margin: "4px 0 0" }}>
                            {milestone.description}
                          </p>
                        ) : null}
                        <div className="muted" style={{ marginTop: 4 }}>
                          {milestone.deadline ? `Deadline ${formatHistoryDate(milestone.deadline)}` : "No deadline"}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", fontWeight: 700 }}>
                        {formatCurrency(milestone.amount)}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ) : null}
        {canRequestMilestoneChanges ? (
          <div className="card agreement-change-card" style={{ marginTop: 12 }}>
            <div className="agreement-change-card__heading">
              <div>
                <strong>Request agreement changes</strong>
                <p className="muted" style={{ margin: "4px 0 0" }}>
                  Review the full agreement, add milestones if needed, and redistribute milestone amounts within the fixed escrow amount.
                </p>
              </div>
              {!agreementChangeDraft ? (
                <button className="ghost" onClick={() => beginAgreementChangeRequest(tx)}>
                  Edit agreement
                </button>
              ) : null}
            </div>
            {agreementChangeDraft ? (
              <>
                <div className="milestone-target" style={{ marginTop: 12 }}>
                  <div>
                    <div className="milestone-target__label">Fixed escrow amount</div>
                    <div className="milestone-target__sub">Milestone totals must match this amount.</div>
                  </div>
                  <div className="milestone-target__totals">
                    <div className="milestone-target__value">{formatCurrency(tx.amount)}</div>
                  </div>
                </div>
                <div className="agreement-change-list">
                  {agreementChangeDraft.milestones.map((milestone, index) => (
                    <div key={milestone.id} className="agreement-change-row">
                      <div className="agreement-change-row__title">
                        <strong>{milestone.isNew ? "New milestone" : `Milestone ${index + 1}`}</strong>
                      </div>
                      <div className="form-grid">
                        <div className="form-field">
                          <label className="muted">Title</label>
                          <input
                            value={milestone.title}
                            onChange={(event) => updateAgreementChangeMilestone(milestone.id, { title: event.target.value })}
                          />
                        </div>
                        <div className="form-field">
                          <label className="muted">Amount</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={formatCurrencyInput(milestone.amount)}
                            placeholder="$0.00"
                            onChange={(event) => updateAgreementChangeMilestone(milestone.id, { amount: normalizeCurrencyInput(event.target.value) })}
                          />
                          {milestone.isNew ? (
                            <div
                              className="agreement-change-row__remaining"
                              data-overdrawn={draftAgreementRemaining < 0}
                              data-complete={Math.round(draftAgreementRemaining * 100) === 0}
                            >
                              Remaining amount: {formatCurrency(draftAgreementRemaining)}
                              {draftAgreementRemaining < 0 ? (
                                <span className="agreement-change-row__remaining-help">
                                  Modify other milestone amounts to free up funds for this one.
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        <div className="form-field">
                          <label className="muted">Deadline</label>
                          <input
                            type="date"
                            value={milestone.deadline}
                            onChange={(event) => updateAgreementChangeMilestone(milestone.id, { deadline: event.target.value })}
                          />
                        </div>
                      </div>
                      <div className="form-field" style={{ marginTop: 8 }}>
                        <label className="muted">Description</label>
                        <textarea
                          rows={3}
                          value={milestone.description}
                          onChange={(event) => updateAgreementChangeMilestone(milestone.id, { description: event.target.value })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <button className="ghost" style={{ marginTop: 10 }} onClick={addAgreementChangeMilestone}>
                  Draft another milestone
                </button>
                <div className="form-field" style={{ marginTop: 12 }}>
                  <label className="muted">Reason or note</label>
                  <textarea
                    rows={2}
                    value={agreementChangeDraft.note}
                    onChange={(event) => setAgreementChangeDraft((current) => current ? { ...current, note: event.target.value } : current)}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button
                    className="btn"
                    onClick={() => handleRequestAgreementChanges(tx)}
                    disabled={requestAgreementChangesMutation.isPending || !agreementDraftReady}
                  >
                    {requestAgreementChangesMutation.isPending ? "Sending..." : agreementSubmitLabel}
                  </button>
                  <button className="ghost" onClick={() => setAgreementChangeDraft(null)}>Cancel</button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
        {canApproveEscrow ? (
          <div className="card" style={{ marginTop: 12 }}>
            <strong>Accept and sign</strong>
            <p className="muted" style={{ marginTop: 8, marginBottom: 12 }}>
              Sign only after reviewing the agreement and deciding no changes are needed.
            </p>
            <div style={{ marginBottom: 12 }}>
              <div className="muted" style={{ marginBottom: 6 }}>You are signing as</div>
              <div className="role-toggle">
                {(["individual", "business"] as const).map((partyType) => (
                  <label key={partyType} className={`role-option ${approvalPartyType === partyType ? "active" : ""}`} onClick={() => {
                    setApprovalPartyType(partyType);
                    if (partyType === "business" && businessProfileQuery.data?.businessProfile && !Object.values(approvalBusiness).some((value) => value.trim())) {
                      setApprovalBusiness(businessProfileQuery.data.businessProfile);
                    }
                  }}>
                    <input type="radio" name="approval-party-type" checked={approvalPartyType === partyType} readOnly />
                    <span className="role-copy">{partyType === "individual" ? "Myself" : "A business"}</span>
                  </label>
                ))}
              </div>
              {approvalPartyType === "business" ? (
                <div className="business-identity-fields" style={{ marginBottom: 12 }}>
                  <div className="form-field">
                    <label className="muted">Business Name</label>
                    <input value={approvalBusiness.legalName} onChange={(event) => setApprovalBusiness((current) => ({ ...current, legalName: event.target.value }))} />
                  </div>
                  <div className="form-field">
                    <label className="muted">Your Title</label>
                    <input value={approvalBusiness.representativeTitle} onChange={(event) => setApprovalBusiness((current) => ({ ...current, representativeTitle: event.target.value }))} />
                  </div>
                </div>
              ) : null}
              <div className="sig-wrap">
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
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
            </div>
          </div>
        ) : null}
        {tx.isOwner && isChangesRequested && hasAgreementChangeRequest ? (
          <div className="card agreement-change-card" style={{ marginTop: 12 }}>
            <div className="agreement-change-card__heading">
              <div>
                <strong>Review requested agreement changes</strong>
                <p className="muted" style={{ margin: "4px 0 0" }}>
                  Compare the original agreement to the proposed agreement before accepting or keeping the original.
                </p>
              </div>
              <div className="role-toggle agreement-toggle">
                {(["original", "proposed"] as const).map((mode) => (
                  <label key={mode} className={`role-option ${agreementReviewMode === mode ? "active" : ""}`} onClick={() => setAgreementReviewMode(mode)}>
                    <input type="radio" name="agreement-review-mode" checked={agreementReviewMode === mode} readOnly />
                    <span className="role-copy">{mode === "original" ? "Old agreement" : "New proposal"}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="milestone-target" style={{ marginTop: 12 }}>
              <div>
                <div className="milestone-target__label">Fixed escrow amount</div>
                <div className="milestone-target__sub">The escrow amount cannot be changed.</div>
              </div>
              <div className="milestone-target__totals">
                <div className="milestone-target__value">{formatCurrency(tx.amount)}</div>
                <div className="muted">Proposed total: {formatCurrency(proposedAgreementTotal)}</div>
              </div>
            </div>
            {agreementReviewMode === "original" ? (
              <div className="agreement-change-list">
                {tx.milestones.filter((milestone) => milestone.amount > 0).map((milestone) => (
                  <div key={milestone.id} className="agreement-change-row">
                    <strong>{milestone.title}</strong>
                    <div>{formatCurrency(milestone.amount)}</div>
                    <div className="muted">{milestone.deadline ? `Due ${formatHistoryDate(milestone.deadline)}` : "No deadline"}</div>
                    <div className="muted">{milestone.description || "No description"}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="agreement-change-list">
                {requestedAgreementMilestones.map((milestone) => {
                  const reviewDraft = milestoneReviewDrafts[milestone.id] ?? buildMilestoneReviewDraft(milestone);
                  return (
                    <div key={milestone.id} className="agreement-change-row">
                      <div className="agreement-change-row__title">
                        <strong>{milestone.amount === 0 ? "New milestone" : milestone.title}</strong>
                      </div>
                      <div className="form-grid">
                        <div className="form-field">
                          <label className="muted" htmlFor={`review-title-${milestone.id}`}>Title</label>
                          <input
                            id={`review-title-${milestone.id}`}
                            value={reviewDraft.title}
                            onChange={(event) => updateMilestoneReviewDraft(milestone, { title: event.target.value })}
                          />
                        </div>
                        <div className="form-field">
                          <label className="muted" htmlFor={`review-amount-${milestone.id}`}>Amount</label>
                          <input
                            id={`review-amount-${milestone.id}`}
                            type="text"
                            inputMode="decimal"
                            value={formatCurrencyInput(reviewDraft.amount)}
                            placeholder="$0.00"
                            onChange={(event) => updateMilestoneReviewDraft(milestone, { amount: normalizeCurrencyInput(event.target.value) })}
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
                      <div className="form-field" style={{ marginTop: 8 }}>
                        <label className="muted" htmlFor={`review-description-${milestone.id}`}>Description</label>
                        <textarea
                          id={`review-description-${milestone.id}`}
                          rows={3}
                          value={reviewDraft.description}
                          onChange={(event) => updateMilestoneReviewDraft(milestone, { description: event.target.value })}
                        />
                      </div>
                      {milestone.changeRequestNote ? (
                        <div className="milestone-review__note"><strong>Counterparty note:</strong> {milestone.changeRequestNote}</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="milestone-review__actions">
              <button className="btn" onClick={() => handleApplyAgreementChanges(tx, "accept")} disabled={applyAgreementChangesMutation.isPending}>
                {applyAgreementChangesMutation.isPending ? "Saving..." : "Accept agreement changes"}
              </button>
              <button className="ghost" onClick={() => handleApplyAgreementChanges(tx, "reject")} disabled={applyAgreementChangesMutation.isPending}>
                Keep original agreement
              </button>
            </div>
          </div>
        ) : null}
        {tx.milestones.length && !isAwaitingApproval && !isChangesRequested ? (
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
                    ? "Milestone decisions unlock after the agreement is signed and the escrow is funded."
                    : isChangesRequested
                      ? tx.isOwner
                        ? "Review the whole requested agreement. You can compare the original to the proposed agreement before accepting it."
                        : "Your requested agreement changes are awaiting the creator's review."
                    : isAwaitingFunding
                      ? "Milestone decisions unlock after the agreement is signed and the escrow is funded."
                      : "Milestone decisions are not available yet."}
              </div>
            ) : null}
            <div className="tx-list" style={{ marginTop: 12 }}>
              {tx.milestones.map((milestone) => {
                return (
                <div key={milestone.id} className="tx-item milestone-entry">
                  <div className="milestone-entry__top">
                    <div>
                      <strong>{milestone.title}</strong>
                      <div className="muted">
                        {milestone.amount === 0 && milestone.changeRequestedAt
                          ? "Proposed new milestone"
                          : milestone.status === "released"
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
                    <div style={{ textAlign: "right", fontWeight: 700 }}>
                      {milestone.amount === 0 && milestone.requestedAmount !== undefined ? formatCurrency(milestone.requestedAmount) : formatCurrency(milestone.amount)}
                    </div>
                  </div>
                  {milestone.changeRequestedAt ? (
                    <div className="milestone-warning" style={{ marginTop: 10 }}>
                      <strong>{tx.isOwner ? "Included in requested agreement changes" : "Requested revision awaiting review"}</strong>
                      <div style={{ marginTop: 6 }}>{milestone.requestedTitle}</div>
                      <div className="muted">
                        {milestone.requestedAmount !== undefined ? formatCurrency(milestone.requestedAmount) : null}
                        {milestone.requestedDeadline ? ` • Due ${formatHistoryDate(milestone.requestedDeadline)}` : " • No deadline"}
                      </div>
                      {milestone.requestedDescription ? <div className="muted" style={{ marginTop: 4 }}>{milestone.requestedDescription}</div> : null}
                      {milestone.changeRequestNote ? <div style={{ marginTop: 6 }}>Note: {milestone.changeRequestNote}</div> : null}
                    </div>
                  ) : null}
                  <div className="milestone-actions">
                    {milestone.changeRequestedAt ? (
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
    return <SplashScreen />;
  }

  return (
    <AppShell screenId={activeScreen}>
      {splashVisible ? <SplashScreen /> : null}
      <Header
        activeScreen={activeScreen}
        notificationCount={openNotifications}
        hasUnreadNotifications={hasUnreadNotifications}
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

function SplashScreen() {
  return (
    <main className="splash-screen" aria-label="Loading MyEscrow">
      <div className="splash-logo-wrap">
        <img className="splash-logo" src="/myescrow-logo.png" alt="MyEscrow" />
      </div>
    </main>
  );
}

export default function Home(props: HomeProps) {
  if (liveDashboardEnabled) {
    return <LiveDashboard />;
  }
  return <MockExperienceHome searchParams={props.searchParams} />;
}
