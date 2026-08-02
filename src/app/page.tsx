"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
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
  useDeleteEscrowCreationDraft,
  useDisputes,
  useEscrowCreationDraft,
  useFundEscrow,
  useFundMilestone,
  useRejectEscrow,
  useRejectMilestone,
  useOpenMilestoneDispute,
  useSubmitDisputeEvidence,
  useRequestDisputeArbitration,
  useProposeDisputeResolution,
  useResolveDispute,
  useRequestFundedCancellation,
  useSaveEscrowCreationDraft,
  useAcceptFundedCancellation,
  useSubmitCancellationInformation,
  useResendInvitation,
  useRequestAgreementChanges,
  useSubmitMilestone,
  useSignAgreement,
  useExtendInvitation,
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
import {
  latestNotificationSeenToken,
  useNotificationSeenToken,
} from "@/lib/notificationSeen";
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
import {
  escrowDetailPrompts,
  type EscrowDetailPromptIndex,
  validateEscrowDetailPrompt,
} from "@/lib/escrowWalkthrough";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import { jsPDF } from "jspdf";
import { apiFetch } from "@/lib/apiClient";
import { findTransactionByToken } from "@/lib/transactionRouting";
import {
  parseArchivedTransactionTokens,
  updateArchivedTransactionTokens,
} from "@/lib/transactionArchive";
import { previewStagedFunding } from "@/lib/stagedFunding";
import { LiveDashboard } from "@/components/LiveDashboard";
import { NotificationTimestamp } from "@/components/NotificationTimestamp";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import { EscrowChat } from "@/components/EscrowChat";
import { CustomerPortalBoundary } from "@/components/CustomerPortalBoundary";
import type { EscrowRecord } from "@/lib/mockDashboard";
import {
  ESCROW_CREATION_DRAFT_SCHEMA_VERSION,
  clearEscrowCreationDraftCache,
  clearEscrowCreationDraftConflictCache,
  createStoredEscrowCreationDraft,
  hasMeaningfulEscrowCreationDraft,
  parseEscrowCreationDraftData,
  readEscrowCreationDraftCache,
  readEscrowCreationDraftConflictCache,
  writeEscrowCreationDraftCache,
  writeEscrowCreationDraftConflictCache,
  type EscrowCreationDraftData,
  type StoredEscrowCreationDraft,
} from "@/lib/escrowCreationDraft";

type ScreenId =
  | "welcome"
  | "dashboard"
  | "create"
  | "milestones"
  | "agreement"
  | "wallet"
  | "transactions"
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
  status: "not_started" | "submitted" | "revision_requested" | "released" | "disputed" | "refunded" | "settled" | "cancelled";
  fundingStatus?: "not_funded" | "partially_funded" | "funded";
  fundedCents?: number;
  releasedAt?: string;
  rejectedAt?: string;
  reviewDeadline?: string;
  reminderSentAt?: string;
  reviewOverdueAt?: string;
  submissions?: Array<{
    id: number;
    submissionNumber: number;
    note?: string;
    submittedAt: string;
    reviewDeadline: string;
    submitter: { id: string; name: string };
    evidence: Array<{
      id: number;
      fileName: string;
      contentType: string;
      sizeBytes: number;
      sha256: string;
      storageStatus: "managed" | "metadata_only";
    }>;
    review?: {
      decision: string;
      reason?: string;
      reviewedAt: string;
      reviewer: { id: string; name: string };
    };
  }>;
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
  fundingMode?: "full" | "milestone" | null;
  milestoneFundingSupported?: boolean;
  stagedFundingSupported?: boolean;
  fundedAmount?: number;
  creatorRole?: "buyer" | "seller";
  createdAt?: string;
  approvedAt?: string;
  buyerSignatureDataUrl?: string;
  sellerSignatureDataUrl?: string;
  agreement?: EscrowRecord["agreement"];
  invitation?: EscrowRecord["invitation"];
  cancellation?: EscrowRecord["cancellation"];
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

const emptyEscrowCreationForm = () => ({
  role: "buyer" as "buyer" | "seller",
  counterpartyEmail: "",
  counterpartyEmailConfirmation: "",
  title: "",
  amount: "",
  category: "Goods",
  description: "",
  fundingMode: null as "full" | "milestone" | null,
  partyType: "individual" as "individual" | "business",
  business: emptyBusinessDetails(),
});

const emptyMilestoneInputs = () => ({
  title: "",
  amount: "",
  description: "",
  deadline: "",
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

type DraftSaveStatus = "idle" | "saving" | "saved" | "error";

function EscrowWizardHeader({
  currentStep,
  title,
  description,
  draftSaveStatus,
  hasDraftConflict,
  onSaveAndExit,
  onDiscard,
  onUseLocalDraft,
  onUseServerDraft,
}: {
  currentStep: 1 | 2 | 3;
  title: string;
  description: string;
  draftSaveStatus: DraftSaveStatus;
  hasDraftConflict: boolean;
  onSaveAndExit: () => void;
  onDiscard: () => void;
  onUseLocalDraft: () => void;
  onUseServerDraft: () => void;
}) {
  const steps = ["Details", "Milestones", "Agreement"];
  const saveStatus =
    draftSaveStatus === "saving"
      ? "Saving draft…"
      : draftSaveStatus === "saved"
        ? "Draft saved"
        : draftSaveStatus === "error"
          ? "Saved on this device; account sync will retry"
          : "Changes save automatically";
  return (
    <div className="wizard-header">
      <div className="wizard-header__top">
        <div className="wizard-header__copy">
          <span className="wizard-header__eyebrow">Create escrow</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="wizard-draft-actions">
          <span className="wizard-draft-status" role="status" aria-live="polite">
            {saveStatus}
          </span>
          <div>
            <button
              type="button"
              className="wizard-draft-button"
              onClick={onSaveAndExit}
              disabled={hasDraftConflict}
              title={hasDraftConflict ? "Resolve the draft conflict first." : undefined}
            >
              Save &amp; exit
            </button>
            <button type="button" className="wizard-discard-button" onClick={onDiscard}>
              Discard
            </button>
          </div>
        </div>
      </div>
      {hasDraftConflict ? (
        <div className="wizard-draft-conflict" role="alert">
          <span>A newer draft was saved elsewhere. That version is loaded.</span>
          <div>
            <button type="button" className="wizard-draft-button" onClick={onUseServerDraft}>
              Continue with loaded copy
            </button>
            <button type="button" className="wizard-draft-button" onClick={onUseLocalDraft}>
              Use this device&apos;s copy
            </button>
          </div>
        </div>
      ) : null}
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
  "transactions",
  "history",
  "escrows",
  "settings",
  "transaction",
];

type CreationScreen = "create" | "milestones" | "agreement";

const isCreationScreen = (screen: ScreenId): screen is CreationScreen =>
  screen === "create" || screen === "milestones" || screen === "agreement";

const creationDraftFingerprint = (draft: EscrowCreationDraftData) =>
  JSON.stringify(parseEscrowCreationDraftData(draft));

const pickQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const isScreenId = (value: string | undefined): value is ScreenId =>
  value ? screenIds.includes(value as ScreenId) : false;

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
      { id: "m10106a", title: "Wedding deposit", amount: 800, status: "not_started", description: "Non-refundable date hold" },
      { id: "m10106b", title: "Wedding day performance", amount: 800, status: "not_started", description: "Final set payment" },
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
      { id: "m10107b", title: "Material acquisition", amount: 100000, status: "not_started", description: "Order porcelain tile sets" },
      { id: "m10107c", title: "Delivery", amount: 100000, status: "not_started", description: "Deliver tile to restaurant site" },
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
    milestones: [{ id: "m10105a", title: "Prototype delivery (Northwind)", amount: 650, status: "not_started" }],
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
      { id: "m10102b", title: "Development sprint", amount: 400, status: "not_started" },
      { id: "m10102c", title: "Final handoff", amount: 400, status: "not_started" },
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

const formatFileSize = (bytes: number) =>
  bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1_000))} KB`;

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
    if (["funded", "cancellation_pending", "cancellation_review", "dispute_resolution_pending"].includes(lifecycleStatus)) {
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
        : lifecycleStatus === "creator_signature_required"
          ? "Creator must sign the latest agreement"
          : lifecycleStatus === "rejected"
            ? "Creator can revise, resend, or close the proposal"
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
          lifecycleStatus === "pending_counterparty_signup" || lifecycleStatus === "pending_approval" || lifecycleStatus === "creator_signature_required" || lifecycleStatus === "changes_requested" || lifecycleStatus === "rejected"
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
            : lifecycleStatus === "creator_signature_required"
              ? "The latest agreement needs the creator's signature"
            : lifecycleStatus === "rejected"
              ? "Proposal must be revised and approved first"
            : lifecycleStatus === "changes_requested"
              ? "Milestone changes must be resolved first"
            : lifecycleStatus === "funding_pending"
              ? "Buyer funding pending"
              : "Funds secured in escrow",
        status:
          lifecycleStatus === "pending_counterparty_signup" || lifecycleStatus === "pending_approval" || lifecycleStatus === "creator_signature_required" || lifecycleStatus === "changes_requested" || lifecycleStatus === "rejected"
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
      fundingMode: record.fundingMode ?? (fundingStatus === "funded" ? "full" : null),
      milestoneFundingSupported: Object.prototype.hasOwnProperty.call(record, "fundingMode"),
      stagedFundingSupported: record.stagedFundingSupported === true,
      fundedAmount: record.balances
        ? record.balances.fundedCents / 100
        : fundingStatus === "funded"
          ? amountValue
          : 0,
      creatorRole: record.creatorRole,
      createdAt: record.createdAt,
      approvedAt: record.approvedAt,
      buyerSignatureDataUrl: record.buyerSignatureDataUrl,
      sellerSignatureDataUrl: record.sellerSignatureDataUrl,
      agreement: record.agreement,
      invitation: record.invitation,
      cancellation: record.cancellation,
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
        fundingStatus: milestone.fundingStatus,
        fundedCents: milestone.fundedCents,
        releasedAt: milestone.releasedAt,
        rejectedAt: milestone.rejectedAt,
        reviewDeadline: milestone.reviewDeadline,
        reminderSentAt: milestone.reminderSentAt,
        reviewOverdueAt: milestone.reviewOverdueAt,
        submissions: milestone.submissions ?? [],
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
  const [archivedTransactionTokens, setArchivedTransactionTokens] = useState<string[]>([]);
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
  const [createForm, setCreateForm] = useState(emptyEscrowCreationForm);
  const [createPromptStep, setCreatePromptStep] = useState<EscrowDetailPromptIndex>(0);
  const [createPromptError, setCreatePromptError] = useState<string | null>(null);
  const [descriptionSkipped, setDescriptionSkipped] = useState(false);
  const createPromptHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const [milestones, setMilestones] = useState<DraftMilestone[]>([]);
  const [milestoneInputs, setMilestoneInputs] = useState(emptyMilestoneInputs);
  const milestoneDeadlineRef = useRef<HTMLInputElement | null>(null);
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [milestoneWarning, setMilestoneWarning] = useState<string | null>(null);
  const [draftHydratedUserId, setDraftHydratedUserId] = useState<string | null>(null);
  const [hasCreationDraft, setHasCreationDraft] = useState(false);
  const [draftSaveStatus, setDraftSaveStatus] = useState<DraftSaveStatus>("idle");
  const [creationSubmitting, setCreationSubmitting] = useState(false);
  const [conflictingLocalDraft, setConflictingLocalDraft] = useState<StoredEscrowCreationDraft | null>(null);
  const [lastCreationScreen, setLastCreationScreen] = useState<CreationScreen>(
    isCreationScreen(initialScreen) ? initialScreen : "create",
  );
  const draftSnapshotRef = useRef<EscrowCreationDraftData | null>(null);
  const draftLoadedFromCacheRef = useRef<{
    userId: string;
    draft: StoredEscrowCreationDraft | null;
  } | null>(null);
  const draftAutosaveTimeoutRef = useRef<number | null>(null);
  const draftSaveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const draftLocalRevisionRef = useRef(0);
  const draftServerRevisionRef = useRef(0);
  const draftHydrationBaselineRef = useRef<string | null>(null);
  const draftReconciledServerTokenRef = useRef<{ userId: string; token: string } | null>(null);
  const draftSubmissionInProgressRef = useRef(false);
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
  const [creatorSignatureCaptured, setCreatorSignatureCaptured] = useState(false);
  const [creatorSignatureVersion, setCreatorSignatureVersion] = useState(0);
  const creatorSignaturePadRef = useRef<SignaturePadHandle | null>(null);
  const [approvalPartyType, setApprovalPartyType] = useState<"individual" | "business">("individual");
  const [approvalBusiness, setApprovalBusiness] = useState<BusinessDetails>(emptyBusinessDetails);
  const [walletAmountInput, setWalletAmountInput] = useState("");
  const [stagedFundingInputs, setStagedFundingInputs] = useState<Record<string, string>>({});
  const [message, setMessageState] = useState<string | null>(null);
  const [messageLocation, setMessageLocation] = useState<string | null>(null);
  const [milestoneSubmissionNotes, setMilestoneSubmissionNotes] = useState<Record<string, string>>({});
  const [milestoneProofFiles, setMilestoneProofFiles] = useState<Record<string, File[]>>({});
  const [milestoneRevisionReasons, setMilestoneRevisionReasons] = useState<Record<string, string>>({});
  const [milestoneDisputeReasons, setMilestoneDisputeReasons] = useState<Record<string, string>>({});
  const [disputeEvidenceNotes, setDisputeEvidenceNotes] = useState<Record<string, string>>({});
  const [disputeEvidenceFiles, setDisputeEvidenceFiles] = useState<Record<string, File[]>>({});
  const [disputeEvidenceInputVersions, setDisputeEvidenceInputVersions] = useState<Record<string, number>>({});
  const [disputeResolutionDrafts, setDisputeResolutionDrafts] = useState<Record<string, {
    sellerAmount: string;
    buyerAmount: string;
    note: string;
  }>>({});
  const [cancellationDrafts, setCancellationDrafts] = useState<Record<number, {
    mode: "mutual" | "unilateral";
    reason: string;
  }>>({});
  const [cancellationInformationDrafts, setCancellationInformationDrafts] = useState<Record<string, string>>({});
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
  const setMessage = (nextMessage: string | null) => {
    setMessageState(nextMessage);
    setMessageLocation(null);
  };
  const setInlineMessage = (location: string, nextMessage: string) => {
    setMessageState(nextMessage);
    setMessageLocation(location);
  };
  const renderInlineMessage = (location: string) =>
    message && messageLocation === location ? (
      <div className="field-warning" role="alert" aria-live="assertive">
        {message}
      </div>
    ) : null;
  const profileIdentity: ProfileIdentity = user
    ? {
        id: user.id,
        name: user.name?.trim() || user.email,
        email: user.email,
      }
    : { id: profileDraft.userId, name: profileDraft.name, email: profileDraft.email };
  const currentUser = { name: profileIdentity.name, email: profileIdentity.email };
  const transactionArchiveStorageKey = `myescrow.archived-transactions.${profileIdentity.id}`;
  const savedProfile = resolveProfileDraft(profileDraft, profileIdentity);
  const profile = resolveProfileDraft(profileFormDraft, profileIdentity);
  const greetingName = currentUser.name.trim().split(/\s+/)[0] || currentUser.name;
  const [modalContent, setModalContent] = useState<ModalContent | null>(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState(false);
  const { seenNotificationToken, saveNotificationSeenToken } =
    useNotificationSeenToken(profileIdentity.id);

  const createEscrowMutation = useCreateEscrow();
  const creationDraftQuery = useEscrowCreationDraft(
    Boolean(user && isAuthenticated && !isHydrating),
  );
  const saveCreationDraftMutation = useSaveEscrowCreationDraft();
  const deleteCreationDraftMutation = useDeleteEscrowCreationDraft();
  const saveCreationDraft = saveCreationDraftMutation.mutateAsync;
  const deleteCreationDraft = deleteCreationDraftMutation.mutateAsync;
  const businessProfileQuery = useBusinessProfile();
  const dismissNotificationMutation = useDismissNotification();
  const approveEscrowMutation = useApproveEscrow();
  const approveMilestoneMutation = useApproveMilestone();
  const rejectEscrowMutation = useRejectEscrow();
  const resendInvitationMutation = useResendInvitation();
  const extendInvitationMutation = useExtendInvitation();
  const signAgreementMutation = useSignAgreement();
  const rejectMilestoneMutation = useRejectMilestone();
  const requestAgreementChangesMutation = useRequestAgreementChanges();
  const applyAgreementChangesMutation = useApplyAgreementChanges();
  const updateDraftEscrowMutation = useUpdateDraftEscrow();
  const submitMilestoneMutation = useSubmitMilestone();
  const openMilestoneDisputeMutation = useOpenMilestoneDispute();
  const submitDisputeEvidenceMutation = useSubmitDisputeEvidence();
  const requestDisputeArbitrationMutation = useRequestDisputeArbitration();
  const proposeDisputeResolutionMutation = useProposeDisputeResolution();
  const resolveDisputeMutation = useResolveDispute();
  const requestFundedCancellationMutation = useRequestFundedCancellation();
  const acceptFundedCancellationMutation = useAcceptFundedCancellation();
  const submitCancellationInformationMutation = useSubmitCancellationInformation();
  const cancelEscrowMutation = useCancelEscrow();
  const fundEscrowMutation = useFundEscrow();
  const fundMilestoneMutation = useFundMilestone();
  const notificationsQuery = useNotifications();
  const notificationHistoryQuery = useNotificationHistory();
  const overviewQuery = useEscrowSummary();
  const escrowsQuery = useEscrows();
  const fundingPlanSelectionSupported =
    !liveDataEnabled || escrowsQuery.data?.fundingPlanSelectionSupported === true;
  const disputesQuery = useDisputes();
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
  const archivedTransactionSet = useMemo(
    () => new Set(archivedTransactionTokens),
    [archivedTransactionTokens],
  );
  const transactionArchiveToken = (transaction: Transaction) =>
    String(transaction.reference ?? transaction.id);
  const visiblePortfolioTransactions = displayTransactions.filter(
    (transaction) => !archivedTransactionSet.has(transactionArchiveToken(transaction)),
  );
  const archivedPortfolioTransactions = displayTransactions.filter(
    (transaction) => archivedTransactionSet.has(transactionArchiveToken(transaction)),
  );
  const dashboardTransactions = visiblePortfolioTransactions.slice(0, 4);
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
        const pendingMilestone = tx.milestones.find((milestone) => milestone.status === "submitted");
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
      return Boolean(tx.milestones.find((milestone) => milestone.status === "submitted"));
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
    saveNotificationSeenToken(latestAlertToken);
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
  if (notificationsPanelOpen && latestAlertToken) {
    saveNotificationSeenToken(latestAlertToken);
  }
}, [notificationsPanelOpen, latestAlertToken, saveNotificationSeenToken]);

useEffect(() => {
  if (!isHydrating && !isAuthenticated) {
    router.replace("/login");
  }
}, [isHydrating, isAuthenticated, router]);

useEffect(() => {
  try {
    setArchivedTransactionTokens(
      parseArchivedTransactionTokens(window.localStorage.getItem(transactionArchiveStorageKey)),
    );
  } catch {
    setArchivedTransactionTokens([]);
  }
}, [transactionArchiveStorageKey]);

  const milestoneTotal = useMemo(
    () => milestones.reduce((sum, item) => sum + item.amount, 0),
    [milestones],
  );

const agreementPreview = (() => {
  const amountValue = Number(createForm.amount) || 0;
  const descriptionValue = createForm.description.trim();
  const descriptionLine = descriptionValue ? `\nDescription: ${descriptionValue}` : "";
  const fundingLine = `\nFunding plan: ${
    createForm.fundingMode === "milestone"
      ? "Flexible staged funding"
      : createForm.fundingMode === "full"
        ? "Full escrow funding"
        : "Not selected"
  }`;
  const creatorLabel = createForm.partyType === "business"
    ? `${createForm.business.legalName || "Business pending"}, represented by ${currentUser.name}${createForm.business.representativeTitle ? `, ${createForm.business.representativeTitle}` : ""}`
    : currentUser.name;
  const intro = `Buyer: ${createForm.role === "buyer" ? creatorLabel : createForm.counterpartyEmail || "Buyer pending"}\nSeller: ${
    createForm.role === "seller" ? creatorLabel : createForm.counterpartyEmail || "Seller pending"
  }\nAmount: ${formatCurrency(amountValue)}${fundingLine}${descriptionLine}`;
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

const creationDraftSnapshot = useMemo<EscrowCreationDraftData>(() => ({
  schemaVersion: ESCROW_CREATION_DRAFT_SCHEMA_VERSION,
  screen: isCreationScreen(activeScreen) ? activeScreen : lastCreationScreen,
  createPromptStep,
  descriptionSkipped,
  createForm,
  milestones,
  milestoneInputs,
  editingMilestoneId,
}), [
  activeScreen,
  createForm,
  createPromptStep,
  descriptionSkipped,
  editingMilestoneId,
  lastCreationScreen,
  milestoneInputs,
  milestones,
]);

const navActiveId = useMemo<ScreenId>(() => {
  if (["milestones", "agreement"].includes(activeScreen)) {
    return "create";
  }
  if (activeScreen === "transaction" || activeScreen === "transactions" || activeScreen === "history") {
    return "dashboard";
  }
  return activeScreen;
}, [activeScreen]);

  const navigate = (screen: ScreenId, pushHistory = true, preserveCreationDraft = true) => {
    if (
      preserveCreationDraft
      && isCreationScreen(activeScreen)
      && !isCreationScreen(screen)
      && !draftSubmissionInProgressRef.current
      && !conflictingLocalDraft
    ) {
      const snapshot = draftSnapshotRef.current;
      if (snapshot && (hasCreationDraft || hasMeaningfulEscrowCreationDraft(snapshot))) {
        const cached = cacheCreationDraft(snapshot);
        if (cached) {
          if (draftAutosaveTimeoutRef.current) {
            window.clearTimeout(draftAutosaveTimeoutRef.current);
            draftAutosaveTimeoutRef.current = null;
          }
          void queueCreationDraftSave(snapshot, cached.revision).catch(() => undefined);
        }
      }
    }
    if (screen !== activeScreen && (screen === "settings" || activeScreen === "settings")) {
      setProfileFormDraft({ userId: profileIdentity.id, ...savedProfile });
    }
    if (isCreationScreen(screen)) {
      setLastCreationScreen(screen);
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

const setTransactionArchived = (transaction: Transaction, archived: boolean) => {
  const token = transactionArchiveToken(transaction);
  setArchivedTransactionTokens((current) => {
    const next = updateArchivedTransactionTokens(current, token, archived);
    try {
      window.localStorage.setItem(transactionArchiveStorageKey, JSON.stringify(next));
    } catch {
      // Keep the current session responsive if browser storage is unavailable.
    }
    return next;
  });
  pushToast({
    variant: "success",
    title: archived
      ? `${transaction.title} was hidden from the dashboard.`
      : `${transaction.title} was restored to the dashboard.`,
  });
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

const resetSignaturePad = useCallback(() => {
  setSignatureCaptured(false);
  setSignatureVersion((prev) => prev + 1);
}, []);

const resetCreationFlow = useCallback(() => {
  setCreateForm(emptyEscrowCreationForm());
  setCreatePromptStep(0);
  setCreatePromptError(null);
  setDescriptionSkipped(false);
  setMilestones([]);
  setMilestoneInputs(emptyMilestoneInputs());
  setEditingMilestoneId(null);
  setMilestoneWarning(null);
  setAgreementAccepted(false);
  resetSignaturePad();
}, [resetSignaturePad]);

const restoreCreationFlowFromDraft = useCallback((draft: StoredEscrowCreationDraft) => {
  draftHydrationBaselineRef.current = creationDraftFingerprint(draft);
  setCreateForm({
    ...draft.createForm,
    business: { ...draft.createForm.business },
  });
  setCreatePromptStep(draft.createPromptStep as EscrowDetailPromptIndex);
  setCreatePromptError(null);
  setDescriptionSkipped(draft.descriptionSkipped);
  setMilestones(draft.milestones.map((milestone) => ({ ...milestone })));
  setMilestoneInputs({ ...draft.milestoneInputs });
  setEditingMilestoneId(draft.editingMilestoneId);
  setMilestoneWarning(null);
  setLastCreationScreen(draft.screen);
  setAgreementAccepted(false);
  setSignatureCaptured(false);
  setSignatureVersion((version) => version + 1);
}, []);

const queueCreationDraftSave = useCallback((
  snapshot: EscrowCreationDraftData,
  localRevision: number,
  allowDuringSubmission = false,
) => {
  const operation = draftSaveQueueRef.current
    .catch(() => undefined)
    .then(async () => {
      if (draftSubmissionInProgressRef.current && !allowDuringSubmission) {
        return null;
      }
      try {
        const savedState = await saveCreationDraft({
          baseRevision: draftServerRevisionRef.current,
          draft: snapshot,
        });
        const savedDraft = savedState.draft;
        if (!savedDraft) {
          throw new Error("The agreement draft save response was invalid.");
        }
        draftServerRevisionRef.current = savedState.revision;
        if (draftLocalRevisionRef.current === localRevision) {
          if (user?.id) {
            writeEscrowCreationDraftCache(user.id, savedDraft);
          }
          setDraftSaveStatus("saved");
        } else if (user?.id && draftSnapshotRef.current) {
          const rebasedDraft = createStoredEscrowCreationDraft(
            draftSnapshotRef.current,
            savedDraft,
            undefined,
            savedState.revision,
            true,
          );
          if (rebasedDraft) {
            writeEscrowCreationDraftCache(user.id, rebasedDraft);
          }
        }
        return savedDraft;
      } catch (error) {
        if (draftLocalRevisionRef.current === localRevision) {
          setDraftSaveStatus("error");
        }
        throw error;
      }
    });
  draftSaveQueueRef.current = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}, [saveCreationDraft, user?.id]);

const cacheCreationDraft = useCallback((snapshot: EscrowCreationDraftData) => {
  if (!user?.id) return null;
  const storedDraft = writeEscrowCreationDraftCache(
    user.id,
    snapshot,
    undefined,
    draftServerRevisionRef.current,
  );
  const revision = draftLocalRevisionRef.current + 1;
  draftLocalRevisionRef.current = revision;
  setHasCreationDraft(true);
  setDraftSaveStatus(storedDraft ? "saving" : "error");
  return { storedDraft, revision };
}, [user?.id]);

useEffect(() => {
  draftSnapshotRef.current = creationDraftSnapshot;
}, [creationDraftSnapshot]);

useEffect(() => {
  if (!user?.id || isHydrating || !isAuthenticated) return;
  if (draftLoadedFromCacheRef.current?.userId === user.id) return;

  if (draftAutosaveTimeoutRef.current) {
    window.clearTimeout(draftAutosaveTimeoutRef.current);
    draftAutosaveTimeoutRef.current = null;
  }
  draftSubmissionInProgressRef.current = false;
  draftLocalRevisionRef.current = 0;
  draftServerRevisionRef.current = 0;
  draftHydrationBaselineRef.current = null;
  draftReconciledServerTokenRef.current = null;
  setDraftHydratedUserId(null);
  setDraftSaveStatus("idle");
  setConflictingLocalDraft(null);

  const localDraft = readEscrowCreationDraftCache(user.id);
  draftLoadedFromCacheRef.current = { userId: user.id, draft: localDraft };
  if (localDraft) {
    draftServerRevisionRef.current = localDraft.serverRevision;
    restoreCreationFlowFromDraft(localDraft);
    setHasCreationDraft(true);
    setDraftSaveStatus("saved");
  } else {
    resetCreationFlow();
    setHasCreationDraft(false);
    setLastCreationScreen(isCreationScreen(initialScreen) ? initialScreen : "create");
  }
}, [
  initialScreen,
  isAuthenticated,
  isHydrating,
  resetCreationFlow,
  restoreCreationFlowFromDraft,
  user?.id,
]);

useEffect(() => {
  if (!user?.id) return;
  const cachedLoad = draftLoadedFromCacheRef.current;
  if (cachedLoad?.userId !== user.id) return;
  if (creationDraftQuery.isError) {
    if (draftHydratedUserId !== user.id) {
      setDraftHydratedUserId(user.id);
      setDraftSaveStatus("error");
      setConflictingLocalDraft(readEscrowCreationDraftConflictCache(user.id));
    }
    return;
  }

  const serverState = creationDraftQuery.data;
  if (!serverState) return;
  if (serverState.revision < draftServerRevisionRef.current) {
    if (draftHydratedUserId !== user.id) setDraftHydratedUserId(user.id);
    return;
  }
  const serverToken = `${serverState.revision}:${serverState.draft?.updatedAt ?? "deleted"}`;
  if (
    draftReconciledServerTokenRef.current?.userId === user.id
    && draftReconciledServerTokenRef.current.token === serverToken
  ) {
    if (draftHydratedUserId !== user.id) setDraftHydratedUserId(user.id);
    return;
  }

  const firstHydration = draftHydratedUserId !== user.id;
  const latestLocalDraft = readEscrowCreationDraftCache(user.id);
  const serverDraft = serverState.draft;
  let selectedDraft: StoredEscrowCreationDraft | null = serverDraft;
  let shouldSyncLocalDraft = false;
  let nextConflictingLocalDraft = serverDraft
    ? readEscrowCreationDraftConflictCache(user.id)
    : null;

  if (latestLocalDraft) {
    if (latestLocalDraft.serverRevision === serverState.revision) {
      if (!serverDraft || latestLocalDraft.hasLocalChanges) {
        selectedDraft = latestLocalDraft;
        shouldSyncLocalDraft = latestLocalDraft.hasLocalChanges;
      }
    } else if (!serverDraft) {
      // A newer server tombstone represents an explicit discard or completed agreement.
      selectedDraft = null;
    } else if (latestLocalDraft.hasLocalChanges) {
      // Do not silently overwrite an active draft saved by another session.
      nextConflictingLocalDraft = latestLocalDraft;
      writeEscrowCreationDraftConflictCache(user.id, latestLocalDraft);
    }
  }

  if (!serverDraft) clearEscrowCreationDraftConflictCache(user.id);

  draftServerRevisionRef.current = serverState.revision;
  draftReconciledServerTokenRef.current = { userId: user.id, token: serverToken };
  setConflictingLocalDraft(nextConflictingLocalDraft);
  if (selectedDraft) {
    restoreCreationFlowFromDraft(selectedDraft);
    writeEscrowCreationDraftCache(user.id, selectedDraft);
    draftLoadedFromCacheRef.current = { userId: user.id, draft: selectedDraft };
    setHasCreationDraft(true);
    setDraftSaveStatus(shouldSyncLocalDraft ? "saving" : "saved");
    setLastCreationScreen(selectedDraft.screen);

    const shouldResumeRoute = (
      firstHydration
      && (!initialScreenQuery || isCreationScreen(initialScreen))
    ) || (
      !firstHydration
      && isCreationScreen(activeScreen)
      && activeScreen !== selectedDraft.screen
      && selectedDraft === serverDraft
      && !nextConflictingLocalDraft
    );
    if (shouldResumeRoute) {
      setActiveScreen(selectedDraft.screen);
      const nextUrl = `/?screen=${selectedDraft.screen}`;
      window.history.replaceState({ screen: selectedDraft.screen }, "", nextUrl);
    }

    if (shouldSyncLocalDraft) {
      const revision = draftLocalRevisionRef.current + 1;
      draftLocalRevisionRef.current = revision;
      void queueCreationDraftSave(selectedDraft, revision).catch(() => undefined);
    }
  } else {
    clearEscrowCreationDraftCache(user.id);
    draftLoadedFromCacheRef.current = { userId: user.id, draft: null };
    draftHydrationBaselineRef.current = null;
    setHasCreationDraft(false);
    setDraftSaveStatus("idle");
    resetCreationFlow();
    if (
      (firstHydration && (initialScreen === "milestones" || initialScreen === "agreement"))
      || (!firstHydration && isCreationScreen(activeScreen) && activeScreen !== "create")
    ) {
      setActiveScreen("create");
      setLastCreationScreen("create");
      window.history.replaceState({ screen: "create" }, "", "/?screen=create");
    }
  }
  setDraftHydratedUserId(user.id);
}, [
  creationDraftQuery.data,
  creationDraftQuery.isError,
  activeScreen,
  draftHydratedUserId,
  initialScreen,
  initialScreenQuery,
  queueCreationDraftSave,
  resetCreationFlow,
  restoreCreationFlowFromDraft,
  user?.id,
]);

useEffect(() => {
  if (
    !user?.id
    || draftHydratedUserId !== user.id
    || !isCreationScreen(activeScreen)
    || draftSubmissionInProgressRef.current
    || conflictingLocalDraft
    || (
      !hasCreationDraft
      && !hasMeaningfulEscrowCreationDraft(creationDraftSnapshot)
    )
  ) {
    return;
  }

  const snapshotFingerprint = creationDraftFingerprint(creationDraftSnapshot);
  if (draftHydrationBaselineRef.current !== null) {
    if (draftHydrationBaselineRef.current === snapshotFingerprint) return;
    draftHydrationBaselineRef.current = null;
  }

  const cached = cacheCreationDraft(creationDraftSnapshot);
  if (!cached) return;
  if (draftAutosaveTimeoutRef.current) {
    window.clearTimeout(draftAutosaveTimeoutRef.current);
  }
  draftAutosaveTimeoutRef.current = window.setTimeout(() => {
    draftAutosaveTimeoutRef.current = null;
    void queueCreationDraftSave(creationDraftSnapshot, cached.revision).catch(() => undefined);
  }, 700);

  return () => {
    if (draftAutosaveTimeoutRef.current) {
      window.clearTimeout(draftAutosaveTimeoutRef.current);
      draftAutosaveTimeoutRef.current = null;
    }
  };
}, [
  activeScreen,
  cacheCreationDraft,
  conflictingLocalDraft,
  creationDraftSnapshot,
  draftHydratedUserId,
  hasCreationDraft,
  queueCreationDraftSave,
  user?.id,
]);

useEffect(() => {
  if (!user?.id) return;
  const preserveLatestDraft = () => {
    const snapshot = draftSnapshotRef.current;
    if (!snapshot || draftSubmissionInProgressRef.current || conflictingLocalDraft) return;
    if (!hasCreationDraft && !hasMeaningfulEscrowCreationDraft(snapshot)) return;
    writeEscrowCreationDraftCache(
      user.id,
      snapshot,
      undefined,
      draftServerRevisionRef.current,
    );
  };
  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") preserveLatestDraft();
  };
  window.addEventListener("pagehide", preserveLatestDraft);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  return () => {
    window.removeEventListener("pagehide", preserveLatestDraft);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}, [conflictingLocalDraft, hasCreationDraft, user?.id]);

const saveCreationDraftAndExit = async () => {
  if (conflictingLocalDraft) {
    pushToast({
      variant: "error",
      title: "Choose which draft copy to use before saving and exiting.",
    });
    return;
  }
  const snapshot = draftSnapshotRef.current;
  if (!snapshot || !user?.id) return;

  if (draftAutosaveTimeoutRef.current) {
    window.clearTimeout(draftAutosaveTimeoutRef.current);
    draftAutosaveTimeoutRef.current = null;
  }
  const cached = cacheCreationDraft(snapshot);
  if (!cached) return;

  try {
    await queueCreationDraftSave(snapshot, cached.revision, true);
    pushToast({ variant: "success", title: "Draft saved. You can continue it any time." });
  } catch {
    if (!cached.storedDraft) {
      pushToast({
        variant: "error",
        title: "This draft could not be saved. Keep this page open and try again.",
      });
      return;
    }
    pushToast({
      variant: "info",
      title: "Draft saved on this device. Account sync will retry when you return.",
    });
  }
  navigate("dashboard", true, false);
};

const discardCreationDraft = () => {
  confirm({
    title: "Discard this draft?",
    body: "Your saved answers and milestones will be permanently removed. No agreement has been sent yet.",
    confirmLabel: "Discard draft",
    onConfirm: async () => {
      draftSubmissionInProgressRef.current = true;
      if (draftAutosaveTimeoutRef.current) {
        window.clearTimeout(draftAutosaveTimeoutRef.current);
        draftAutosaveTimeoutRef.current = null;
      }
      await draftSaveQueueRef.current.catch(() => undefined);
      try {
        const deletedState = await deleteCreationDraft(draftServerRevisionRef.current);
        draftServerRevisionRef.current = deletedState.revision;
      } catch {
        draftSubmissionInProgressRef.current = false;
        pushToast({
          variant: "error",
          title: "The draft could not be discarded. Nothing was removed.",
        });
        return;
      }

      if (user?.id) {
        clearEscrowCreationDraftCache(user.id);
        clearEscrowCreationDraftConflictCache(user.id);
        draftLoadedFromCacheRef.current = { userId: user.id, draft: null };
      }
      draftLocalRevisionRef.current = 0;
      draftHydrationBaselineRef.current = null;
      setHasCreationDraft(false);
      setDraftSaveStatus("idle");
      setConflictingLocalDraft(null);
      setLastCreationScreen("create");
      resetCreationFlow();
      navigate("welcome", true, false);
      draftSubmissionInProgressRef.current = false;
      pushToast({ variant: "info", title: "Draft discarded." });
    },
  });
};

const useConflictingDeviceDraft = () => {
  if (!user?.id || !conflictingLocalDraft || !creationDraftQuery.data?.draft) return;
  const rebasedDraft = createStoredEscrowCreationDraft(
    conflictingLocalDraft,
    creationDraftQuery.data.draft,
    undefined,
    draftServerRevisionRef.current,
    true,
  );
  if (!rebasedDraft) return;
  setActiveScreen(rebasedDraft.screen);
  window.history.replaceState(
    { screen: rebasedDraft.screen },
    "",
    `/?screen=${rebasedDraft.screen}`,
  );
  restoreCreationFlowFromDraft(rebasedDraft);
  writeEscrowCreationDraftCache(user.id, rebasedDraft);
  setHasCreationDraft(true);
  setDraftSaveStatus("saving");
  const revision = draftLocalRevisionRef.current + 1;
  draftLocalRevisionRef.current = revision;
  void queueCreationDraftSave(rebasedDraft, revision)
    .then(() => {
      clearEscrowCreationDraftConflictCache(user.id);
      setConflictingLocalDraft(null);
    })
    .catch(() => setConflictingLocalDraft(conflictingLocalDraft));
};

const useLoadedServerDraft = () => {
  if (!user?.id) return;
  const loadedScreen = creationDraftQuery.data?.draft?.screen;
  if (loadedScreen) {
    setActiveScreen(loadedScreen);
    setLastCreationScreen(loadedScreen);
    window.history.replaceState(
      { screen: loadedScreen },
      "",
      `/?screen=${loadedScreen}`,
    );
  }
  clearEscrowCreationDraftConflictCache(user.id);
  setConflictingLocalDraft(null);
  setDraftSaveStatus("saved");
};

const beginOrResumeCreation = () => {
  navigate(hasCreationDraft ? lastCreationScreen : "create");
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
  if (activeScreen !== "create") return;
  const frameId = window.requestAnimationFrame(() => {
    createPromptHeadingRef.current?.focus({ preventScroll: true });
  });
  return () => window.cancelAnimationFrame(frameId);
}, [activeScreen, createPromptStep]);

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
    if (isCreationScreen(screenFromState)) {
      setLastCreationScreen(screenFromState);
    }
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

  const handleCreatePromptNext = () => {
    if (createPromptStep === 6 && !fundingPlanSelectionSupported) {
      setCreatePromptError(
        escrowsQuery.isLoading
          ? "Checking backend support for agreement funding plans."
          : "Funding-plan selection is waiting for the backend deployment to finish.",
      );
      return;
    }
    const promptError = validateEscrowDetailPrompt(createPromptStep, {
      partyType: createForm.partyType,
      business: createForm.business,
      counterpartyEmail: createForm.counterpartyEmail,
      counterpartyEmailConfirmation: createForm.counterpartyEmailConfirmation,
      currentUserEmail: currentUser.email,
      title: createForm.title,
      amount: createForm.amount,
      description: createForm.description,
      descriptionSkipped,
      fundingMode: createForm.fundingMode,
    });
    if (promptError) {
      setCreatePromptError(promptError);
      return;
    }

    setCreatePromptError(null);
    setMessage(null);
    if (createPromptStep < escrowDetailPrompts.length - 1) {
      setCreatePromptStep((createPromptStep + 1) as EscrowDetailPromptIndex);
      return;
    }
    navigate("milestones");
  };

  const handleCreatePromptBack = () => {
    setCreatePromptError(null);
    setMessage(null);
    if (createPromptStep === 0) {
      void saveCreationDraftAndExit();
      return;
    }
    setCreatePromptStep((createPromptStep - 1) as EscrowDetailPromptIndex);
  };

  const handleAddMilestone = () => {
    if (!milestoneInputs.title || !Number(milestoneInputs.amount)) {
      setInlineMessage("milestone-builder", "Provide a milestone title and amount.");
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
    setMilestoneInputs(emptyMilestoneInputs());
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
      setMilestoneInputs(emptyMilestoneInputs());
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
    if (draftSubmissionInProgressRef.current || createEscrowMutation.isPending) {
      return;
    }
    if (conflictingLocalDraft) {
      setInlineMessage("agreement-submit", "Resolve the draft conflict before submitting.");
      return;
    }
    if (!agreementAccepted || !signatureCaptured) {
      setInlineMessage("agreement-submit", "Accept the agreement and confirm the signature to continue.");
      return;
    }
    const escrowAmount = Number(createForm.amount);
    if (!escrowAmount) {
      setInlineMessage("agreement-submit", "Enter an escrow amount before submitting.");
      return;
    }
    if (!createForm.fundingMode) {
      setInlineMessage("agreement-submit", "Choose a funding plan before submitting.");
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
      setInlineMessage("agreement-submit", "Please draw your signature before submitting.");
      return;
    }
    draftSubmissionInProgressRef.current = true;
    setCreationSubmitting(true);
    if (draftAutosaveTimeoutRef.current) {
      window.clearTimeout(draftAutosaveTimeoutRef.current);
      draftAutosaveTimeoutRef.current = null;
    }
    const latestDraft = draftSnapshotRef.current;
    if (latestDraft) {
      const cached = cacheCreationDraft(latestDraft);
      if (cached) {
        try {
          await queueCreationDraftSave(latestDraft, cached.revision, true);
        } catch {
          draftSubmissionInProgressRef.current = false;
          setCreationSubmitting(false);
          setInlineMessage(
            "agreement-submit",
            "Your draft changed in another session or could not be synced. Reload it before submitting.",
          );
          return;
        }
      }
    }
    try {
      const submittedDraftRevision = draftServerRevisionRef.current;
      const response: CreateEscrowResponse = await createEscrowMutation.mutateAsync({
        title: responseTitle,
        counterpartyEmail: createForm.counterpartyEmail || "counterparty@example.com",
        amount: escrowAmount,
        fundingMode: createForm.fundingMode,
        creatorRole: createForm.role,
        creatorParty: createForm.partyType === "business"
          ? { type: "business", business: createForm.business }
          : { type: "individual" },
        category: createForm.category,
        description: descriptionValue || undefined,
        signatureDataUrl,
        draftRevision: submittedDraftRevision,
        milestones: (milestones.length
          ? milestones
          : [{
              id: randomId(),
              title: responseTitle,
              amount: escrowAmount,
              description: descriptionValue || undefined,
              deadline: undefined,
            }]
        ).map((milestone) => ({
          title: milestone.title,
          amount: milestone.amount,
          description: milestone.description || undefined,
          deadline: milestone.deadline ? new Date(`${milestone.deadline}T00:00:00.000Z`).toISOString() : undefined,
        })),
      });
      draftServerRevisionRef.current = submittedDraftRevision + 1;
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
        fundingMode: createForm.fundingMode,
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
          status: "not_started",
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
      if (user?.id) {
        clearEscrowCreationDraftCache(user.id);
        clearEscrowCreationDraftConflictCache(user.id);
        draftLoadedFromCacheRef.current = { userId: user.id, draft: null };
      }
      draftLocalRevisionRef.current = 0;
      setHasCreationDraft(false);
      setDraftSaveStatus("idle");
      setConflictingLocalDraft(null);
      setCreationSubmitting(false);
      setLastCreationScreen("create");
      resetCreationFlow();
      setMessage(
        inviteStatus === "signup_required"
          ? "Invitation sent. Funding can continue after the counterparty creates and verifies an account."
          : inviteStatus === "verification_required"
            ? "Invitation sent. Funding can continue after the counterparty verifies their account."
            : "Escrow drafted. Funding will start after both parties sign.",
      );
      navigate("dashboard", true, false);
      draftSubmissionInProgressRef.current = false;
    } catch (error) {
      draftSubmissionInProgressRef.current = false;
      setCreationSubmitting(false);
      setInlineMessage(
        "agreement-submit",
        error instanceof Error ? error.message : "Unable to create escrow. Try again shortly.",
      );
    }
  };

  const handleMilestoneDecision = (txId: number, milestoneId: string, decision: "approve" | "reject") => {
    const target = findTransactionById(txId);
    if (!target) {
      setInlineMessage(`milestone-review:${milestoneId}`, "Transaction not found.");
      return;
    }
    if (sameEmail(currentUser.email, target.sellerEmail)) {
      setInlineMessage(`milestone-review:${milestoneId}`, "Only the buyer can approve milestone releases.");
      return;
    }
    if (!target.counterpartyApproved) {
      setInlineMessage(
        `milestone-review:${milestoneId}`,
        "Wait for the counterparty to approve the project before reviewing milestones.",
      );
      return;
    }
    if (target.status !== "Active") {
      setInlineMessage(
        `milestone-review:${milestoneId}`,
        "Milestones can only be approved once the escrow is active and funded.",
      );
      return;
    }
    if (liveDataEnabled) {
      const escrowId = target.reference ?? `PO-${target.id}`;
      const actionLabel = decision === "approve" ? "approve" : "reject";
      const executeLiveDecision = async () => {
        try {
          if (decision === "approve") {
            await approveMilestoneMutation.mutateAsync({ escrowId, milestoneId });
          } else {
            const reason = milestoneRevisionReasons[milestoneId]?.trim() ?? "";
            if (reason.length < 3) {
              setInlineMessage(
                `milestone-review:${milestoneId}`,
                "Explain what the seller needs to revise before sending it back.",
              );
              return;
            }
            await rejectMilestoneMutation.mutateAsync({ escrowId, milestoneId, reason });
            setMilestoneRevisionReasons((current) => ({ ...current, [milestoneId]: "" }));
          }
          setMessage(
            decision === "approve"
              ? "Milestone approved and funds released to the seller."
              : "Revision requested and the reason was saved in the submission history.",
          );
        } catch (error) {
          setInlineMessage(
            `milestone-review:${milestoneId}`,
            error instanceof Error ? error.message : `Unable to ${actionLabel} milestone.`,
          );
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
          status: "revision_requested",
          rejectedAt: timestamp,
        };
      });
        const allReleased = updatedMilestones.length > 0 && updatedMilestones.every((item) => item.status === "released");
        const anyRejected = updatedMilestones.some((item) => item.status === "revision_requested");
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

  const handleMilestoneSubmit = async (txId: number, milestoneId: string) => {
    const target = findTransactionById(txId);
    if (!target) {
      setInlineMessage(`milestone-submission:${milestoneId}`, "Transaction not found.");
      return;
    }
    const milestone = target.milestones.find((item) => item.id === milestoneId);
    if (!milestone) {
      setInlineMessage(`milestone-submission:${milestoneId}`, "Milestone not found.");
      return;
    }
    const isFunded =
      target.fundingMode === "full"
      || (!target.fundingMode && target.status === "Active")
      || milestone.fundingStatus === "funded"
      || (milestone.fundedCents ?? 0) >= Math.round(milestone.amount * 100);
    if (!isFunded) {
      setInlineMessage(
        `milestone-submission:${milestoneId}`,
        "The buyer must fully secure this milestone before work or proof can be submitted.",
      );
      return;
    }
    const note = milestoneSubmissionNotes[milestoneId]?.trim() ?? "";
    const files = milestoneProofFiles[milestoneId] ?? [];
    if (!note && files.length === 0) {
      setInlineMessage(
        `milestone-submission:${milestoneId}`,
        "Add a submission note or at least one proof file.",
      );
      return;
    }
    if (liveDataEnabled) {
      const escrowId = target.reference ?? `PO-${target.id}`;
      try {
        await submitMilestoneMutation.mutateAsync({ escrowId, milestoneId, note, files });
        setMilestoneSubmissionNotes((current) => ({ ...current, [milestoneId]: "" }));
        setMilestoneProofFiles((current) => ({ ...current, [milestoneId]: [] }));
        setMessage("Work submitted for buyer review. Funds remain held until the buyer decides.");
      } catch (error) {
        setInlineMessage(
          `milestone-submission:${milestoneId}`,
          error instanceof Error ? error.message : "Unable to submit milestone work.",
        );
      }
      return;
    }

    const updated = updateTransaction(txId, (tx) => ({
      ...tx,
      milestones: tx.milestones.map((milestone) =>
        milestone.id === milestoneId
          ? {
              ...milestone,
              status: "submitted",
              rejectedAt: undefined,
              reviewDeadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
              submissions: [
                ...(milestone.submissions ?? []),
                {
                  id: Date.now(),
                  submissionNumber: (milestone.submissions?.length ?? 0) + 1,
                  note,
                  submittedAt: new Date().toISOString(),
                  reviewDeadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
                  submitter: { id: currentUser.email, name: currentUser.name },
                  evidence: files.map((file, index) => ({
                    id: Date.now() + index,
                    fileName: file.name,
                    contentType: file.type,
                    sizeBytes: file.size,
                    sha256: "",
                    storageStatus: "managed" as const,
                  })),
                },
              ],
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
      setMilestoneSubmissionNotes((current) => ({ ...current, [milestoneId]: "" }));
      setMilestoneProofFiles((current) => ({ ...current, [milestoneId]: [] }));
      setMessage("Work submitted for buyer review.");
    }
  };

  const handleMilestoneProofSelection = (milestoneId: string, selected: FileList | null) => {
    const files = Array.from(selected ?? []);
    if (files.length > 10) {
      setInlineMessage(`milestone-submission:${milestoneId}`, "Upload no more than 10 proof files per submission.");
      return;
    }
    const oversized = files.find((file) => file.size > 25_000_000);
    if (oversized) {
      setInlineMessage(`milestone-submission:${milestoneId}`, `${oversized.name} is larger than the 25 MB limit.`);
      return;
    }
    if (files.reduce((total, file) => total + file.size, 0) > 100_000_000) {
      setInlineMessage(`milestone-submission:${milestoneId}`, "Proof files may total no more than 100 MB.");
      return;
    }
    setMilestoneProofFiles((current) => ({ ...current, [milestoneId]: files }));
  };

  const handleDownloadMilestoneProof = async (
    tx: Transaction,
    milestone: TxMilestone,
    submissionId: number,
    evidenceId: number,
    fileName: string,
  ) => {
    try {
      const escrowId = tx.reference ?? `PO-${tx.id}`;
      const response = await apiFetch(
        `/api/dashboard/escrows/${escrowId}/milestones/${milestone.id}/submissions/${submissionId}/evidence/${evidenceId}`,
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to download this proof file.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (error) {
      setInlineMessage(
        `proof-download:${milestone.id}`,
        error instanceof Error ? error.message : "Unable to download this proof file.",
      );
    }
  };

  const handleOpenMilestoneDispute = async (tx: Transaction, milestoneId: string) => {
    const reason = milestoneDisputeReasons[milestoneId]?.trim() ?? "";
    if (reason.length < 10) {
      setInlineMessage(`milestone-dispute:${milestoneId}`, "Describe the dispute in at least 10 characters.");
      return;
    }
    try {
      await openMilestoneDisputeMutation.mutateAsync({
        escrowId: tx.reference ?? `PO-${tx.id}`,
        milestoneId,
        reason,
      });
      setMilestoneDisputeReasons((current) => ({ ...current, [milestoneId]: "" }));
      setMessage("Dispute opened. Only this milestone's remaining funds are reserved.");
    } catch (error) {
      setInlineMessage(
        `milestone-dispute:${milestoneId}`,
        error instanceof Error ? error.message : "Unable to open the dispute.",
      );
    }
  };

  const handleSubmitDisputeEvidence = async (disputeId: string) => {
    const note = disputeEvidenceNotes[disputeId]?.trim() ?? "";
    const files = disputeEvidenceFiles[disputeId] ?? [];
    if (!note && !files.length) {
      setInlineMessage(`dispute-evidence:${disputeId}`, "Add an evidence note or at least one file before submitting.");
      return;
    }
    if (files.length > 10) {
      setInlineMessage(`dispute-evidence:${disputeId}`, "Upload no more than 10 evidence files at once.");
      return;
    }
    const oversized = files.find((file) => file.size > 25_000_000);
    if (oversized) {
      setInlineMessage(`dispute-evidence:${disputeId}`, `${oversized.name} is larger than the 25 MB limit.`);
      return;
    }
    if (files.reduce((total, file) => total + file.size, 0) > 100_000_000) {
      setInlineMessage(`dispute-evidence:${disputeId}`, "Evidence files may total no more than 100 MB.");
      return;
    }
    try {
      await submitDisputeEvidenceMutation.mutateAsync({ disputeId, note, files });
      setDisputeEvidenceNotes((current) => ({ ...current, [disputeId]: "" }));
      setDisputeEvidenceFiles((current) => ({ ...current, [disputeId]: [] }));
      setDisputeEvidenceInputVersions((current) => ({
        ...current,
        [disputeId]: (current[disputeId] ?? 0) + 1,
      }));
      setMessage(files.length
        ? "Evidence files were stored and added to the shared dispute history."
        : "Evidence note added to the shared dispute history.");
    } catch (error) {
      setInlineMessage(
        `dispute-evidence:${disputeId}`,
        error instanceof Error ? error.message : "Unable to add dispute evidence.",
      );
    }
  };

  const handleProposeDisputeResolution = async (disputeId: string) => {
    const draft = disputeResolutionDrafts[disputeId];
    const sellerAmount = Number(draft?.sellerAmount ?? "");
    const buyerAmount = Number(draft?.buyerAmount ?? "");
    if (!Number.isFinite(sellerAmount) || !Number.isFinite(buyerAmount) || sellerAmount < 0 || buyerAmount < 0) {
      setInlineMessage(
        `dispute-resolution:${disputeId}`,
        "Enter valid non-negative seller and buyer allocations.",
      );
      return;
    }
    try {
      await proposeDisputeResolutionMutation.mutateAsync({
        disputeId,
        sellerAmount,
        buyerAmount,
        note: draft?.note.trim() || undefined,
      });
      setMessage("Complete allocation proposed. The other party must accept it before money moves.");
    } catch (error) {
      setInlineMessage(
        `dispute-resolution:${disputeId}`,
        error instanceof Error ? error.message : "Unable to propose the resolution.",
      );
    }
  };

  const handleRequestDisputeArbitration = async (disputeId: string) => {
    try {
      await requestDisputeArbitrationMutation.mutateAsync({ disputeId });
      setMessage("Arbitration requested. The disputed funds remain reserved during review.");
    } catch (error) {
      setInlineMessage(
        `dispute-actions:${disputeId}`,
        error instanceof Error ? error.message : "Unable to request arbitration.",
      );
    }
  };

  const handleAcceptDisputeResolution = async (disputeId: string) => {
    try {
      await resolveDisputeMutation.mutateAsync({ disputeId });
      setMessage("Resolution accepted. The frozen amount was fully allocated through the escrow ledger.");
    } catch (error) {
      setInlineMessage(
        `dispute-actions:${disputeId}`,
        error instanceof Error ? error.message : "Unable to accept the resolution.",
      );
    }
  };

  const handleRequestFundedCancellation = async (tx: Transaction) => {
    const draft = cancellationDrafts[tx.id] ?? { mode: "mutual" as const, reason: "" };
    if (draft.reason.trim().length < 10) {
      setInlineMessage(`cancellation:${tx.id}`, "Explain the cancellation request in at least 10 characters.");
      return;
    }
    try {
      const result = await requestFundedCancellationMutation.mutateAsync({
        escrowId: tx.reference ?? `PO-${tx.id}`,
        mode: draft.mode,
        reason: draft.reason.trim(),
      });
      setMessage(result.status === "pending"
        ? "Mutual cancellation requested. No refund occurs until the other party accepts."
        : "Unilateral cancellation entered administrative review. Funds remain held; operations will not decide contested contractual merits.");
    } catch (error) {
      setInlineMessage(
        `cancellation:${tx.id}`,
        error instanceof Error ? error.message : "Unable to request cancellation.",
      );
    }
  };

  const handleAcceptFundedCancellation = async (cancellationId: string) => {
    try {
      const result = await acceptFundedCancellationMutation.mutateAsync({ cancellationId });
      setMessage(`Cancellation accepted. ${formatCurrency(result.refundedCents / 100)} was returned to the buyer; disputed funds remain held.`);
    } catch (error) {
      setInlineMessage(
        `cancellation-action:${cancellationId}`,
        error instanceof Error ? error.message : "Unable to accept cancellation.",
      );
    }
  };

  const handleSubmitCancellationInformation = async (cancellationId: string) => {
    const note = cancellationInformationDrafts[cancellationId]?.trim() ?? "";
    if (note.length < 10) {
      setInlineMessage(
        `cancellation-information:${cancellationId}`,
        "Provide the requested administrative information in at least 10 characters.",
      );
      return;
    }
    try {
      await submitCancellationInformationMutation.mutateAsync({ cancellationId, note });
      setCancellationInformationDrafts((current) => ({ ...current, [cancellationId]: "" }));
      setMessage("Information submitted. Funds remain held while the administrator reviews the response.");
    } catch (error) {
      setInlineMessage(
        `cancellation-information:${cancellationId}`,
        error instanceof Error ? error.message : "Unable to submit cancellation information.",
      );
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
      setInlineMessage(`draft-edit:${tx.id}`, "Title, counterparty email, and amount are required.");
      return;
    }
    const invalidMilestone = draftEscrowEdit.milestones.find(
      (milestone) => !milestone.title.trim() || !Number.isFinite(Number(milestone.amount)) || Number(milestone.amount) <= 0,
    );
    if (invalidMilestone) {
      setInlineMessage(`draft-edit:${tx.id}`, "Every milestone needs a title and valid amount.");
      return;
    }
    const total = draftEscrowEditTotal(draftEscrowEdit);
    if (Math.round(total * 100) !== Math.round(amount * 100)) {
      setInlineMessage(
        `draft-edit:${tx.id}`,
        `Milestone amounts must add up to the escrow amount of ${formatCurrency(amount)}.`,
      );
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
      setMessage("Proposal updated and invitation queued. Sign the latest agreement version to complete the update.");
    } catch (error) {
      setInlineMessage(
        `draft-edit:${tx.id}`,
        error instanceof Error ? error.message : "Unable to update the draft escrow.",
      );
    }
  };

  const buildAgreementChangeDraft = (tx: Transaction): AgreementChangeDraft => ({
    milestones: tx.milestones
      .filter((milestone) => milestone.status === "not_started")
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
      setInlineMessage(`agreement-change:${tx.id}`, "Every milestone needs a title and valid amount.");
      return;
    }
    const total = agreementDraftTotal(agreementChangeDraft);
    if (Math.round(total * 100) !== Math.round(tx.amount * 100)) {
      const difference = total - tx.amount;
      setInlineMessage(
        `agreement-change:${tx.id}`,
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
      setInlineMessage(
        `agreement-change:${tx.id}`,
        error instanceof Error ? error.message : "Unable to request agreement changes.",
      );
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
        setInlineMessage(`agreement-review:${tx.id}`, "Every proposed milestone needs a title and valid amount.");
        return;
      }
      const total = reviewMilestones.reduce((sum, milestone) => sum + milestone.amount, 0);
      if (Math.round(total * 100) !== Math.round(tx.amount * 100)) {
        setInlineMessage(
          `agreement-review:${tx.id}`,
          `Milestone amounts must add up to the escrow amount of ${formatCurrency(tx.amount)}.`,
        );
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
      setInlineMessage(
        `agreement-review:${tx.id}`,
        error instanceof Error ? error.message : "Unable to complete the agreement review.",
      );
    }
  };

  const handleApproveEscrow = async (tx: Transaction) => {
    const escrowId = tx.reference ?? `PO-${tx.id}`;
    const signatureDataUrl = approvalSignaturePadRef.current?.getDataUrl();
    if (!signatureDataUrl) {
      setInlineMessage(`approval:${tx.id}`, "Draw your signature before approving the agreement.");
      return;
    }
    if (approvalPartyType === "business" && !businessDetailsComplete(approvalBusiness)) {
      setInlineMessage(`approval:${tx.id}`, "Enter the Business Name and Your Title before approving the escrow.");
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
      setInlineMessage(
        `approval:${tx.id}`,
        error instanceof Error ? error.message : "Unable to approve escrow.",
      );
    }
  };

  const handleSignCurrentAgreement = async (tx: Transaction) => {
    const signatureDataUrl = creatorSignaturePadRef.current?.getDataUrl();
    if (!signatureDataUrl) {
      setInlineMessage(`creator-signature:${tx.id}`, "Draw your signature before signing the corrected agreement.");
      return;
    }
    try {
      await signAgreementMutation.mutateAsync({
        escrowId: tx.reference ?? `PO-${tx.id}`,
        signatureDataUrl,
      });
      creatorSignaturePadRef.current?.clear();
      setCreatorSignatureCaptured(false);
      setCreatorSignatureVersion((version) => version + 1);
      setMessage("The latest agreement version is signed and ready for the counterparty.");
    } catch (error) {
      setInlineMessage(
        `creator-signature:${tx.id}`,
        error instanceof Error ? error.message : "Unable to sign the current agreement.",
      );
    }
  };

  const handleResendInvitation = async (tx: Transaction) => {
    try {
      await resendInvitationMutation.mutateAsync({ escrowId: tx.reference ?? `PO-${tx.id}` });
      setMessage("A fresh invitation has been queued for delivery.");
    } catch (error) {
      setInlineMessage(
        `invitation:${tx.id}`,
        error instanceof Error ? error.message : "Unable to resend the invitation.",
      );
    }
  };

  const handleExtendInvitation = async (tx: Transaction) => {
    try {
      await extendInvitationMutation.mutateAsync({
        escrowId: tx.reference ?? `PO-${tx.id}`,
        days: 7,
      });
      setMessage("The invitation deadline was extended by seven days.");
    } catch (error) {
      setInlineMessage(
        `invitation:${tx.id}`,
        error instanceof Error ? error.message : "Unable to extend the invitation.",
      );
    }
  };

  const handleRejectEscrow = async (tx: Transaction) => {
    const escrowId = tx.reference ?? `PO-${tx.id}`;
    try {
      await rejectEscrowMutation.mutateAsync({ escrowId });
      setMessage("Escrow rejected.");
    } catch (error) {
      setInlineMessage(
        `approval:${tx.id}`,
        error instanceof Error ? error.message : "Unable to reject escrow.",
      );
    }
  };

  const handleCancelEscrow = async (tx: Transaction) => {
    const escrowId = tx.reference ?? `PO-${tx.id}`;
    try {
      await cancelEscrowMutation.mutateAsync({ escrowId });
      setMessage("Escrow cancelled.");
    } catch (error) {
      setInlineMessage(
        `next-step:${tx.id}`,
        error instanceof Error ? error.message : "Unable to cancel escrow.",
      );
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
          if (!liveDataEnabled) {
            updateTransaction(tx.id, (current) => ({
              ...current,
              status: "Active",
              context: "Milestones active",
              lifecycleStatus: "funded",
              fundingStatus: "funded",
              fundingMode: "full",
              fundedAmount: current.amount,
              milestones: current.milestones.map((milestone) => ({
                ...milestone,
                fundingStatus: "funded",
                fundedCents: Math.round(milestone.amount * 100),
              })),
            }));
            setWalletBalanceOverride({
              userId: walletStateUserId,
              balance: walletBalanceDisplay - tx.amount,
            });
          }
          setMessage("Escrow funded with dummy wallet funds.");
        } catch (error) {
          setInlineMessage(
            `funding:${tx.id}`,
            error instanceof Error ? error.message : "Unable to fund escrow.",
          );
        }
      },
    });
  };

  const handleFundMilestone = (
    tx: Transaction,
    milestone: TxMilestone,
    amount: number,
  ) => {
    if (
      liveDataEnabled
      && (
        tx.milestoneFundingSupported === false
        || tx.stagedFundingSupported === false
      )
    ) {
      const errorMessage = "Flexible staged funding is waiting for the backend deployment to finish.";
      setInlineMessage(`funding:${tx.id}`, errorMessage);
      pushToast({
        variant: "error",
        title: "Staged funding unavailable",
        body: errorMessage,
      });
      return;
    }
    const remainingEscrowAmount = Math.max(0, tx.amount - (tx.fundedAmount ?? 0));
    if (!Number.isFinite(amount) || amount <= 0) {
      setInlineMessage(`funding:${tx.id}`, "Enter a valid funding amount.");
      return;
    }
    if (amount > remainingEscrowAmount + 0.001) {
      setInlineMessage(
        `funding:${tx.id}`,
        `You can add at most ${formatCurrency(remainingEscrowAmount)} to this escrow.`,
      );
      return;
    }
    if (amount > walletBalanceDisplay + 0.001) {
      setInlineMessage(
        `funding:${tx.id}`,
        `Your wallet needs ${formatCurrency(amount - walletBalanceDisplay)} more.`,
      );
      return;
    }
    const preview = previewStagedFunding(
      tx.milestones.map((item) => ({
        id: item.id,
        title: item.title,
        amountCents: Math.round(item.amount * 100),
        fundedCents: item.fundedCents ?? 0,
      })),
      Math.round(amount * 100),
    );
    const affectedMilestones = preview.filter((allocation) => allocation.addedCents > 0);
    const allocationSummary = affectedMilestones
      .map((allocation) => {
        const applied = formatCurrency(allocation.addedCents / 100);
        return allocation.fundingStatus === "funded"
          ? `${applied} completes ${allocation.title}`
          : `${applied} is applied to ${allocation.title}`;
      })
      .join(". ");
    const escrowId = tx.reference ?? `PO-${tx.id}`;
    const fundingInputKey = String(tx.reference ?? tx.id);
    confirm({
      title: "Add staged funding?",
      body: `This will move ${formatCurrency(amount)} from your MyEscrow test wallet into escrow. ${allocationSummary}.`,
      confirmLabel: "Add funds",
      onConfirm: async () => {
        try {
          await fundMilestoneMutation.mutateAsync({
            escrowId,
            milestoneId: milestone.id,
            amount,
          });
          if (!liveDataEnabled) {
            updateTransaction(tx.id, (current) => {
              const currentPreview = previewStagedFunding(
                current.milestones.map((item) => ({
                  id: item.id,
                  title: item.title,
                  amountCents: Math.round(item.amount * 100),
                  fundedCents: item.fundedCents ?? 0,
                })),
                Math.round(amount * 100),
              );
              const allocationByMilestone = new Map(
                currentPreview.map((allocation) => [allocation.id, allocation] as const),
              );
              const nextMilestones = current.milestones.map((item) => {
                const allocation = allocationByMilestone.get(item.id);
                return allocation
                  ? {
                      ...item,
                      fundingStatus: allocation.fundingStatus,
                      fundedCents: allocation.resultingFundedCents,
                    }
                  : item;
              });
              const fundedAmount = Math.min(current.amount, (current.fundedAmount ?? 0) + amount);
              return {
                ...current,
                status: "Active",
                context: `${formatCurrency(fundedAmount)} secured`,
                lifecycleStatus: "funded",
                fundingStatus: fundedAmount >= current.amount ? "funded" : "partially_funded",
                fundingMode: "milestone",
                fundedAmount,
                milestones: nextMilestones,
              };
            });
            setWalletBalanceOverride({
              userId: walletStateUserId,
              balance: walletBalanceDisplay - amount,
            });
          }
          setStagedFundingInputs((current) => {
            const next = { ...current };
            delete next[fundingInputKey];
            return next;
          });
          const fullyFundedNames = affectedMilestones
            .filter((allocation) => allocation.fundingStatus === "funded")
            .map((allocation) => allocation.title);
          setMessage(`${formatCurrency(amount)} added to staged funding.`);
          pushToast({
            variant: "success",
            title: "Funding added",
            body: fullyFundedNames.length > 0
              ? `${fullyFundedNames.join(", ")} fully secured.`
              : "The next milestone is partially secured.",
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unable to add funding.";
          setInlineMessage(
            `funding:${tx.id}`,
            errorMessage,
          );
          pushToast({
            variant: "error",
            title: "Staged funding failed",
            body: errorMessage,
          });
        }
      },
    });
  };

  const handleWalletTopup = async () => {
    const amount = Number(walletAmountInput);
    if (!amount || amount <= 0) {
      setInlineMessage("wallet-amount", "Enter a valid top-up amount.");
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
      setInlineMessage("wallet-amount", error instanceof Error ? error.message : "Unable to top up wallet.");
    }
  };

const handleWalletWithdraw = async () => {
    const amount = Number(walletAmountInput);
    if (!amount || amount <= 0) {
      setInlineMessage("wallet-amount", "Enter a valid withdrawal amount.");
      return;
    }
    if (amount > walletBalanceDisplay) {
      setInlineMessage("wallet-amount", "Not enough balance to withdraw.");
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
      setInlineMessage("wallet-amount", error instanceof Error ? error.message : "Unable to withdraw.");
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
            <button className="btn home-primary-action" onClick={beginOrResumeCreation}>
              {hasCreationDraft ? "Resume your draft" : "Create an escrow"} <span aria-hidden="true">→</span>
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
              {pendingCard.steps.map((step) => {
                const content = (
                  <>
                    <span className="home-progress__dot" />
                    <span className="home-progress__label">{step.title}</span>
                  </>
                );

                return step.status === "upcoming" ? (
                  <div key={step.title} className="home-progress__step" data-status={step.status}>
                    {content}
                  </div>
                ) : (
                  <button
                    key={step.title}
                    type="button"
                    className="home-progress__step home-progress__step--clickable"
                    data-status={step.status}
                    onClick={() => viewTransaction(pendingCard)}
                    aria-label={`${step.title}: open ${pendingCard.title}`}
                  >
                    {content}
                  </button>
                );
              })}
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

  const renderPortfolioTransactionRow = (tx: Transaction, archived = false) => (
    <div
      key={tx.id}
      className={`tx-item portfolio-transaction-row${archived ? " portfolio-transaction-row--archived" : ""}`}
    >
      <button
        className="portfolio-transaction-row__main"
        type="button"
        onClick={() => viewTransaction(tx)}
        aria-label={`View transaction ${tx.title}`}
      >
        <span>
          <strong>{tx.title}</strong>
          <span className="muted">{tx.counterpart}</span>
        </span>
        <span className="portfolio-transaction-row__meta">
          <span>{formatCurrency(tx.amount)}</span>
          <span className="muted">{tx.context}</span>
        </span>
      </button>
      <button
        className="ghost portfolio-transaction-row__archive"
        type="button"
        onClick={() => setTransactionArchived(tx, !archived)}
        aria-label={`${archived ? "Restore" : "Archive"} ${tx.title}`}
      >
        {archived ? "Restore" : "Archive"}
      </button>
    </div>
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
          <div className="muted alerts-tile__label">Open items</div>
          <div className="alerts-tile__count" style={{ fontSize: 26, fontWeight: 800 }}>{openNotifications}</div>
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
          <div className="portfolio-list-actions">
            <span className="portfolio-list-count">{visiblePortfolioTransactions.length} visible</span>
            <button className="ghost portfolio-see-all" type="button" onClick={() => navigate("transactions")}>
              See all
            </button>
          </div>
        </div>
        <div
          className="tx-list dashboard-transactions__list"
          role="region"
          aria-label="Transactions list"
        >
          {dashboardTransactions.length ? (
            dashboardTransactions.map((tx) => renderPortfolioTransactionRow(tx))
          ) : (
            <div className="portfolio-empty-state">
              All transactions are archived. Use See all to restore one.
            </div>
          )}
        </div>
      </div>
    </section>
  );

  const renderCreate = () => {
    const counterpartLabel = createForm.role === "buyer" ? "Seller" : "Buyer";
    const prompt = escrowDetailPrompts[createPromptStep];
    const progress = Math.round(((createPromptStep + 1) / escrowDetailPrompts.length) * 100);

    const updateCreateForm = <Key extends keyof typeof createForm>(
      key: Key,
      value: (typeof createForm)[Key],
    ) => {
      setCreateForm((current) => ({ ...current, [key]: value }));
      setCreatePromptError(null);
    };

    const renderPrompt = () => {
      switch (createPromptStep) {
        case 0:
          return (
            <fieldset className="walkthrough-fieldset">
              <legend className="sr-only">{prompt.title}</legend>
              <div className="walkthrough-choice-grid">
                {(["buyer", "seller"] as const).map((role) => (
                  <label
                    key={role}
                    className={`walkthrough-choice ${createForm.role === role ? "active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="role"
                      checked={createForm.role === role}
                      onChange={() => updateCreateForm("role", role)}
                    />
                    <span className="walkthrough-choice__icon" aria-hidden="true">
                      {role === "buyer" ? "↓" : "↑"}
                    </span>
                    <span>
                      <strong>{role === "buyer" ? "I'm the buyer" : "I'm the seller"}</strong>
                      <small>
                        {role === "buyer"
                          ? "You will fund the escrow after both parties sign."
                          : "You will receive funds as work is approved."}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        case 1:
          return (
            <>
              <fieldset className="walkthrough-fieldset">
                <legend className="sr-only">{prompt.title}</legend>
                <div className="walkthrough-choice-grid">
                  {(["individual", "business"] as const).map((partyType) => (
                    <label
                      key={partyType}
                      className={`walkthrough-choice ${createForm.partyType === partyType ? "active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="creator-party-type"
                        checked={createForm.partyType === partyType}
                        onChange={() => {
                          const nextBusiness =
                            partyType === "business"
                            && businessProfileQuery.data?.businessProfile
                            && !Object.values(createForm.business).some((value) => value.trim())
                              ? businessProfileQuery.data.businessProfile
                              : createForm.business;
                          setCreateForm((current) => ({
                            ...current,
                            partyType,
                            business: nextBusiness,
                          }));
                          setCreatePromptError(null);
                        }}
                      />
                      <span className="walkthrough-choice__icon" aria-hidden="true">
                        {partyType === "individual" ? "01" : "Co"}
                      </span>
                      <span>
                        <strong>{partyType === "individual" ? "Myself" : "A business"}</strong>
                        <small>
                          {partyType === "individual"
                            ? "Use your personal identity on the agreement."
                            : "Sign as an authorized business representative."}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {createForm.partyType === "business" ? (
                <div className="business-identity-fields walkthrough-followup">
                  <div className="form-field">
                    <label htmlFor="walkthrough-business-name">
                      Business name <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="walkthrough-business-name"
                      value={createForm.business.legalName}
                      maxLength={200}
                      autoComplete="organization"
                      onChange={(event) => {
                        setCreateForm((current) => ({
                          ...current,
                          business: { ...current.business, legalName: event.target.value },
                        }));
                        setCreatePromptError(null);
                      }}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="walkthrough-business-title">
                      Your title <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="walkthrough-business-title"
                      value={createForm.business.representativeTitle}
                      maxLength={200}
                      placeholder="Director, owner, officer…"
                      autoComplete="organization-title"
                      onChange={(event) => {
                        setCreateForm((current) => ({
                          ...current,
                          business: {
                            ...current.business,
                            representativeTitle: event.target.value,
                          },
                        }));
                        setCreatePromptError(null);
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </>
          );
        case 2:
          return (
            <div className="walkthrough-stacked-fields walkthrough-email-confirmation">
              <div className="form-field">
                <label htmlFor="walkthrough-counterparty-email">
                  {counterpartLabel} email <span aria-hidden="true">*</span>
                </label>
                <input
                  id="walkthrough-counterparty-email"
                  type="email"
                  value={createForm.counterpartyEmail}
                  maxLength={320}
                  placeholder="counterparty@example.com"
                  autoComplete="email"
                  autoFocus
                  onChange={(event) => updateCreateForm("counterpartyEmail", event.target.value)}
                />
                <small>We&apos;ll send the agreement here for review and signature.</small>
              </div>
              <div className="form-field">
                <label htmlFor="walkthrough-counterparty-email-confirmation">
                  Re-enter {counterpartLabel.toLowerCase()} email <span aria-hidden="true">*</span>
                </label>
                <input
                  id="walkthrough-counterparty-email-confirmation"
                  type="email"
                  value={createForm.counterpartyEmailConfirmation}
                  maxLength={320}
                  placeholder="Enter the email again"
                  autoComplete="off"
                  onChange={(event) =>
                    updateCreateForm("counterpartyEmailConfirmation", event.target.value)
                  }
                />
                <small>Entering it twice helps catch accidental typos.</small>
              </div>
            </div>
          );
        case 3:
          return (
            <div className="walkthrough-stacked-fields">
              <div className="form-field">
                <label htmlFor="walkthrough-title">
                  Escrow name <span aria-hidden="true">*</span>
                </label>
                <input
                  id="walkthrough-title"
                  type="text"
                  value={createForm.title}
                  maxLength={200}
                  placeholder="e.g., Northwind onboarding kit"
                  autoFocus
                  onChange={(event) => updateCreateForm("title", event.target.value)}
                />
                <small>Use a name both parties will recognize later.</small>
              </div>
              <div className="form-field">
                <label htmlFor="walkthrough-category">Category</label>
                <select
                  id="walkthrough-category"
                  value={createForm.category}
                  onChange={(event) => updateCreateForm("category", event.target.value)}
                >
                  <option>Goods</option>
                  <option>Services</option>
                  <option>Other</option>
                </select>
              </div>
            </div>
          );
        case 4:
          return (
            <div className="form-field walkthrough-single-field walkthrough-amount-field">
              <label htmlFor="walkthrough-amount">
                Escrow amount <span aria-hidden="true">*</span>
              </label>
              <div
                className={`walkthrough-currency-input ${createPromptError ? "is-invalid" : ""}`}
              >
                <span aria-hidden="true">$</span>
                <input
                  id="walkthrough-amount"
                  type="text"
                  inputMode="decimal"
                  value={formatCurrencyInput(createForm.amount).replace(/^\$/, "")}
                  placeholder="0.00"
                  aria-invalid={Boolean(createPromptError)}
                  aria-describedby={
                    createPromptError
                      ? "walkthrough-amount-help walkthrough-prompt-error"
                      : "walkthrough-amount-help"
                  }
                  autoFocus
                  onChange={(event) =>
                    updateCreateForm("amount", normalizeCurrencyInput(event.target.value))
                  }
                />
              </div>
              <small id="walkthrough-amount-help">
                This is the total the buyer will fund after both parties sign.
              </small>
            </div>
          );
        case 5:
          return (
            <div className="form-field walkthrough-single-field">
              <label htmlFor="walkthrough-description">
                Scope summary <span className="field-optional">Recommended</span>
              </label>
              <textarea
                id="walkthrough-description"
                rows={5}
                value={createForm.description}
                maxLength={10_000}
                placeholder="Describe what is being provided, the expected outcome, and any important boundaries."
                autoFocus
                onChange={(event) => {
                  updateCreateForm("description", event.target.value);
                  setDescriptionSkipped(false);
                }}
              />
              <small>This gives both parties shared context before you define payment milestones.</small>
            </div>
          );
        case 6:
          return (
            <fieldset className="walkthrough-fieldset">
              <legend className="sr-only">{prompt.title}</legend>
              <div className="walkthrough-choice-grid">
                {([
                  {
                    value: "full",
                    title: "Fund the entire escrow",
                    detail: "The buyer deposits the full agreement amount before work begins.",
                    icon: "100%",
                  },
                  {
                    value: "milestone",
                    title: "Flexible staged funding",
                    detail: "The buyer adds flexible deposits that secure milestones in order.",
                    icon: "→",
                  },
                ] as const).map((option) => (
                  <label
                    key={option.value}
                    className={`walkthrough-choice ${
                      createForm.fundingMode === option.value ? "active" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="funding-mode"
                      disabled={!fundingPlanSelectionSupported}
                      checked={createForm.fundingMode === option.value}
                      onChange={() => updateCreateForm("fundingMode", option.value)}
                    />
                    <span className="walkthrough-choice__icon" aria-hidden="true">
                      {option.icon}
                    </span>
                    <span>
                      <strong>{option.title}</strong>
                      <small>{option.detail}</small>
                    </span>
                  </label>
                ))}
              </div>
              <p className="muted" style={{ margin: "12px 0 0" }}>
                {fundingPlanSelectionSupported
                  ? "This choice becomes part of the agreement both parties sign."
                  : escrowsQuery.isLoading
                    ? "Checking backend support..."
                    : "Backend update pending. This agreement term will unlock after deployment."}
              </p>
            </fieldset>
          );
      }
    };

    const answerSummary = [
      createForm.role === "buyer" ? "Buyer" : "Seller",
      createForm.partyType === "business"
        ? createForm.business.legalName || "Business"
        : "Myself",
      createForm.counterpartyEmail || "Not answered",
      createForm.title || "Not answered",
      createForm.amount ? formatCurrency(Number(createForm.amount)) : "Not answered",
      createForm.description
        ? "Scope added"
        : descriptionSkipped
          ? "Skipped"
          : "Not answered",
      createForm.fundingMode === "milestone"
        ? "Flexible staged funding"
        : createForm.fundingMode === "full"
          ? "Full escrow funding"
          : "Not answered",
    ];

    return (
      <section className="screen active create-flow wizard-screen">
        <EscrowWizardHeader
          currentStep={1}
          title="Create a new transaction"
          description="We'll guide you through one decision at a time."
          draftSaveStatus={draftSaveStatus}
          hasDraftConflict={Boolean(conflictingLocalDraft)}
          onSaveAndExit={() => void saveCreationDraftAndExit()}
          onDiscard={discardCreationDraft}
          onUseLocalDraft={useConflictingDeviceDraft}
          onUseServerDraft={useLoadedServerDraft}
        />
        <div
          className="walkthrough-layout"
          inert={conflictingLocalDraft ? true : undefined}
          aria-disabled={Boolean(conflictingLocalDraft)}
        >
          <form
            className="card walkthrough-card"
            onSubmit={(event) => {
              event.preventDefault();
              handleCreatePromptNext();
            }}
          >
            <div className="walkthrough-card__meta">
              <span>Question {createPromptStep + 1} of {escrowDetailPrompts.length}</span>
              <span>{progress}% complete</span>
            </div>
            <div
              className="walkthrough-progress-track"
              role="progressbar"
              aria-label="Transaction details progress"
              aria-valuemin={1}
              aria-valuemax={escrowDetailPrompts.length}
              aria-valuenow={createPromptStep + 1}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <p className="walkthrough-save-note">
              <span aria-hidden="true">✓</span>
              Your answers are saved as you go. Nothing is sent until you review and sign.
            </p>
            <div className="walkthrough-prompt">
              <span className="walkthrough-prompt__label">{prompt.shortLabel}</span>
              <h3 ref={createPromptHeadingRef} tabIndex={-1}>{prompt.title}</h3>
              {createPromptStep === 0 ? (
                <p>Choose the role you will have when this agreement is signed.</p>
              ) : createPromptStep === 1 ? (
                <p>We&apos;ll use this identity for your side of the agreement.</p>
              ) : null}
            </div>
            <div className="walkthrough-answer">{renderPrompt()}</div>
            {createPromptError ? (
              <div id="walkthrough-prompt-error" className="walkthrough-error" role="alert">
                <span aria-hidden="true">!</span>
                {createPromptError}
              </div>
            ) : null}
            <div className="walkthrough-actions">
              <button type="button" className="ghost" onClick={handleCreatePromptBack}>
                {createPromptStep === 0 ? "Save & exit" : "Back"}
              </button>
              <div>
                {createPromptStep === 5 && !createForm.description.trim() ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setDescriptionSkipped(true);
                      setCreatePromptError(null);
                      setMessage(null);
                      setCreatePromptStep(6);
                    }}
                  >
                    Skip for now
                  </button>
                ) : null}
                <button type="submit" className="btn">
                  {createPromptStep === escrowDetailPrompts.length - 1
                    ? "Continue to milestones"
                    : "Continue"}
                </button>
              </div>
            </div>
          </form>
          <aside className="card walkthrough-outline" aria-label="Details walkthrough progress">
            <div className="walkthrough-outline__heading">
              <span>Details walkthrough</span>
              <strong>{createPromptStep + 1} / {escrowDetailPrompts.length}</strong>
            </div>
            <ol>
              {escrowDetailPrompts.map((step, index) => {
                const status =
                  index < createPromptStep
                    ? "complete"
                    : index === createPromptStep
                      ? "active"
                      : "upcoming";
                return (
                  <li key={step.shortLabel} data-status={status}>
                    <span className="walkthrough-outline__marker" aria-hidden="true">
                      {status === "complete" ? "✓" : index + 1}
                    </span>
                    <div>
                      <strong>{step.shortLabel}</strong>
                      <small>{answerSummary[index]}</small>
                    </div>
                    {status === "complete" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCreatePromptStep(index as EscrowDetailPromptIndex);
                          setCreatePromptError(null);
                        }}
                        aria-label={`Edit ${step.shortLabel.toLowerCase()}`}
                      >
                        Edit
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <div className="walkthrough-outline__note">
              <span aria-hidden="true">✓</span>
              <p>
                You won&apos;t advance past a required question until it has been answered.
              </p>
            </div>
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
        <EscrowWizardHeader
          currentStep={2}
          title="Build the milestones"
          description="Break the agreement into clear, reviewable deliverables."
          draftSaveStatus={draftSaveStatus}
          hasDraftConflict={Boolean(conflictingLocalDraft)}
          onSaveAndExit={() => void saveCreationDraftAndExit()}
          onDiscard={discardCreationDraft}
          onUseLocalDraft={useConflictingDeviceDraft}
          onUseServerDraft={useLoadedServerDraft}
        />
        <div
          className="card"
          style={{ marginBottom: 12 }}
          inert={conflictingLocalDraft ? true : undefined}
          aria-disabled={Boolean(conflictingLocalDraft)}
        >
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
        <div
          className="card"
          inert={conflictingLocalDraft ? true : undefined}
          aria-disabled={Boolean(conflictingLocalDraft)}
        >
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
                maxLength={200}
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
        {renderInlineMessage("milestone-builder")}
        <div className="form-field">
          <label className="muted" htmlFor="milestone-description">
            Milestone description
          </label>
          <textarea
            id="milestone-description"
            rows={3}
            value={milestoneInputs.description}
            maxLength={5_000}
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
            <button className="ghost" onClick={() => void saveCreationDraftAndExit()}>
              Save &amp; exit
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
      <EscrowWizardHeader
        currentStep={3}
        title="Review and sign"
        description="Confirm the terms before sending the agreement."
        draftSaveStatus={draftSaveStatus}
        hasDraftConflict={Boolean(conflictingLocalDraft)}
        onSaveAndExit={() => void saveCreationDraftAndExit()}
        onDiscard={discardCreationDraft}
        onUseLocalDraft={useConflictingDeviceDraft}
        onUseServerDraft={useLoadedServerDraft}
      />
      <p className="muted wizard-helper-copy">
        Funding happens after both parties agree to the terms, so no deposits are needed right now.
      </p>
      <div
        className="card"
        style={{ marginBottom: 12 }}
        inert={conflictingLocalDraft ? true : undefined}
        aria-disabled={Boolean(conflictingLocalDraft)}
      >
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
              onSignedChange={(signed) => {
                setSignatureCaptured(signed);
                if (signed && agreementAccepted) {
                  setMessage(null);
                }
              }}
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
            onChange={(event) => {
              const accepted = event.target.checked;
              setAgreementAccepted(accepted);
              if (accepted && signatureCaptured) {
                setMessage(null);
              }
            }}
          />
          I agree to the escrow terms
        </label>
        <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="ghost" onClick={() => void saveCreationDraftAndExit()}>
            Save &amp; exit
          </button>
          <button className="ghost" onClick={() => navigate("milestones")}>
            Back
          </button>
          <button
            className="btn"
            onClick={handleAgreementSubmit}
            disabled={creationSubmitting || createEscrowMutation.isPending}
          >
            {creationSubmitting || createEscrowMutation.isPending ? "Submitting..." : "Submit escrow"}
          </button>
        </div>
        {renderInlineMessage("agreement-submit")}
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
        {renderInlineMessage("wallet-amount")}
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

  const renderTransactions = () => (
    <section className="screen active app-content-page collection-screen portfolio-screen">
      <div className="compact-page-header">
        <div>
          <p className="compact-page-header__eyebrow">Portfolio</p>
          <h2>All transactions</h2>
          <p>Review every transaction and manage what appears on your dashboard.</p>
        </div>
      </div>
      <div className="card portfolio-all-card">
        <div className="section-title-row">
          <div>
            <span>Visible</span>
            <strong>Dashboard transactions</strong>
          </div>
          <span>{visiblePortfolioTransactions.length}</span>
        </div>
        <div className="tx-list portfolio-all-list">
          {visiblePortfolioTransactions.length ? (
            visiblePortfolioTransactions.map((tx) => renderPortfolioTransactionRow(tx))
          ) : (
            <div className="portfolio-empty-state">No transactions are currently visible on the dashboard.</div>
          )}
        </div>

        <div className="section-title-row portfolio-archived-heading">
          <div>
            <span>Hidden</span>
            <strong>Archived transactions</strong>
          </div>
          <span>{archivedPortfolioTransactions.length}</span>
        </div>
        <div className="tx-list portfolio-all-list">
          {archivedPortfolioTransactions.length ? (
            archivedPortfolioTransactions.map((tx) => renderPortfolioTransactionRow(tx, true))
          ) : (
            <div className="portfolio-empty-state">No archived transactions.</div>
          )}
        </div>
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
    const tx = selectedTransactionToken
      ? findTransactionByToken(displayTransactions, selectedTransactionToken) ?? selectedTransaction
      : selectedTransaction;
    if (!tx) {
      const isRestoringTransaction =
        liveDataEnabled && Boolean(selectedTransactionToken) && escrowsQuery.isLoading;
      return (
        <section className="screen active transaction-screen app-content-page">
          <div className="compact-page-header"><div><p className="compact-page-header__eyebrow">Escrow details</p><h2>Transaction</h2></div></div>
          <div className="card">
            <p className="muted">
              {isRestoringTransaction
                ? "Loading transaction details..."
                : selectedTransactionToken
                  ? "This transaction could not be found. Return to the dashboard and try again."
                  : "Select a transaction from the dashboard to view its details."}
            </p>
          </div>
        </section>
      );
    }
    const canReviewMilestones = tx.counterpartyApproved && tx.lifecycleStatus === "funded";
    const isCurrentUserBuyer = sameEmail(currentUser.email, tx.buyerEmail);
    const isAwaitingSignup = tx.lifecycleStatus === "pending_counterparty_signup";
    const isAwaitingApproval = tx.lifecycleStatus === "pending_approval";
    const isCreatorSignatureRequired = tx.lifecycleStatus === "creator_signature_required";
    const isChangesRequested = tx.lifecycleStatus === "changes_requested";
    const isRejected = tx.lifecycleStatus === "rejected";
    const isAwaitingFunding = tx.lifecycleStatus === "funding_pending";
    const activeDisputes = (disputesQuery.data?.disputes ?? []).filter(
      (dispute) => dispute.escrowId === (tx.reference ?? `PO-${tx.id}`),
    );
    const currentUserId = user?.id ?? profileIdentity.id;
    const canApproveEscrow = !tx.isOwner && isAwaitingApproval;
    const canRequestMilestoneChanges = !tx.isOwner && (isAwaitingApproval || isChangesRequested);
    const canFundEscrow = isCurrentUserBuyer && isAwaitingFunding;
    const canUseMilestoneFunding = tx.milestoneFundingSupported !== false;
    const canUseStagedFunding =
      !liveDataEnabled || tx.stagedFundingSupported !== false;
    const hasSecuredFunds =
      (tx.fundedAmount ?? 0) > 0 || tx.fundingStatus === "funded";
    const walletShortfall = Math.max(tx.amount - walletBalanceDisplay, 0);
    const remainingEscrowFunding = Math.max(0, tx.amount - (tx.fundedAmount ?? 0));
    const milestoneIsFunded = (milestone: TxMilestone) =>
      tx.fundingMode === "full"
      || (!tx.fundingMode && tx.status === "Active")
      || milestone.fundingStatus === "funded"
      || (milestone.fundedCents ?? 0) >= Math.round(milestone.amount * 100);
    const milestoneFundingRemaining = (milestone: TxMilestone) =>
      Math.max(0, milestone.amount - (milestone.fundedCents ?? 0) / 100);
    const nextMilestoneToFund = tx.milestones.find(
      (milestone) => milestoneFundingRemaining(milestone) > 0.001,
    );
    const nextMilestoneFundingNeed = nextMilestoneToFund
      ? milestoneFundingRemaining(nextMilestoneToFund)
      : 0;
    const nextMilestoneShortfall = nextMilestoneToFund
      ? Math.max(nextMilestoneFundingNeed - walletBalanceDisplay, 0)
      : 0;
    const stagedFundingInputKey = String(tx.reference ?? tx.id);
    const defaultStagedFundingAmount = Math.min(
      remainingEscrowFunding,
      Math.max(0, nextMilestoneFundingNeed),
    );
    const stagedFundingInput = Object.prototype.hasOwnProperty.call(
      stagedFundingInputs,
      stagedFundingInputKey,
    )
      ? stagedFundingInputs[stagedFundingInputKey] ?? ""
      : defaultStagedFundingAmount.toFixed(2);
    const stagedFundingAmount = Number(stagedFundingInput);
    const stagedFundingAmountIsValid =
      Number.isFinite(stagedFundingAmount)
      && stagedFundingAmount > 0
      && stagedFundingAmount <= remainingEscrowFunding + 0.001
      && stagedFundingAmount <= walletBalanceDisplay + 0.001;
    const stagedFundingPreview = previewStagedFunding(
      tx.milestones.map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        amountCents: Math.round(milestone.amount * 100),
        fundedCents: milestone.fundedCents ?? 0,
      })),
      Number.isFinite(stagedFundingAmount) ? Math.round(Math.max(0, stagedFundingAmount) * 100) : 0,
    ).filter((allocation) => allocation.addedCents > 0);
    const canAddStagedFunding =
      isCurrentUserBuyer
      && canUseMilestoneFunding
      && canUseStagedFunding
      && Boolean(nextMilestoneToFund)
      && remainingEscrowFunding > 0
      && (
        isAwaitingFunding
        || (tx.fundingMode === "milestone" && tx.lifecycleStatus === "funded")
      );
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
      (isAwaitingSignup || isAwaitingApproval || isCreatorSignatureRequired || isChangesRequested || isRejected);
    const canEditDraftEscrow = Boolean(tx.isOwner) &&
      (isAwaitingSignup || isAwaitingApproval || isCreatorSignatureRequired || isRejected);
    const canRecoverInvitation = Boolean(tx.isOwner) && Boolean(tx.invitation) &&
      !["accepted", "corrected"].includes(tx.invitation?.status ?? "accepted") &&
      !["funded", "completed", "cancelled"].includes(tx.lifecycleStatus ?? "");
    const needsCreatorSignature = Boolean(tx.isOwner && tx.agreement && !tx.agreement.creatorSigned) &&
      !["funding_pending", "funded", "completed", "cancelled"].includes(tx.lifecycleStatus ?? "");
    const draftEditTotal = draftEscrowEdit ? draftEscrowEditTotal(draftEscrowEdit) : 0;
    const draftEditAmount = draftEscrowEdit ? Number(draftEscrowEdit.amount) || 0 : 0;
    const stagedFundingControls = canAddStagedFunding && nextMilestoneToFund ? (
      <div className="staged-funding-controls">
        <label className="field staged-funding-controls__amount">
          <span>Amount to add</span>
          <div className="staged-funding-controls__input">
            <span aria-hidden="true">$</span>
            <input
              type="number"
              min="0.01"
              max={Math.min(remainingEscrowFunding, walletBalanceDisplay)}
              step="0.01"
              inputMode="decimal"
              value={stagedFundingInput}
              onChange={(event) => {
                const value = event.target.value;
                setStagedFundingInputs((current) => ({
                  ...current,
                  [stagedFundingInputKey]: value,
                }));
              }}
              aria-describedby={`staged-funding-help-${tx.id}`}
            />
          </div>
        </label>
        <div id={`staged-funding-help-${tx.id}`} className="staged-funding-controls__help muted">
          Add any amount up to {formatCurrency(remainingEscrowFunding)}. Funds are applied to milestones in order.
        </div>
        {stagedFundingPreview.length > 0 ? (
          <div className="staged-funding-preview" aria-live="polite">
            <strong>How this deposit will be applied</strong>
            {stagedFundingPreview.map((allocation) => (
              <div key={allocation.id} className="staged-funding-preview__row">
                <span>{allocation.title}</span>
                <span>
                  +{formatCurrency(allocation.addedCents / 100)}
                  {" · "}
                  {allocation.fundingStatus === "funded"
                    ? "Fully secured"
                    : `${formatCurrency(allocation.remainingCents / 100)} still needed`}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {!stagedFundingAmountIsValid && stagedFundingInput ? (
          <div className="field-warning" role="alert">
            {stagedFundingAmount > remainingEscrowFunding
              ? `The maximum remaining escrow amount is ${formatCurrency(remainingEscrowFunding)}.`
              : stagedFundingAmount > walletBalanceDisplay
                ? `Your wallet needs ${formatCurrency(stagedFundingAmount - walletBalanceDisplay)} more.`
                : "Enter a valid funding amount."}
          </div>
        ) : null}
        <button
          className="btn"
          onClick={() => handleFundMilestone(tx, nextMilestoneToFund, stagedFundingAmount)}
          disabled={!stagedFundingAmountIsValid || fundMilestoneMutation.isPending}
        >
          {fundMilestoneMutation.isPending ? "Adding funds..." : "Add staged funding"}
        </button>
      </div>
    ) : null;
    const showFundingPlan =
      (isCurrentUserBuyer || Boolean(tx.fundingMode))
      && tx.milestones.length > 0
      && !["completed", "cancelled"].includes(tx.lifecycleStatus ?? "")
      && (
        !tx.fundingMode
        || Boolean(stagedFundingControls)
        || (tx.fundingMode === "full" && tx.fundingStatus !== "funded")
      );
    const milestonesNeedAttention =
      tx.lifecycleStatus === "funded"
      && tx.milestones.some((milestone) =>
        milestone.status === "disputed"
        || (isCurrentUserBuyer && milestone.status === "submitted")
        || (
          sameEmail(tx.sellerEmail, currentUser.email)
          && milestoneIsFunded(milestone)
          && ["not_started", "revision_requested"].includes(milestone.status)
        ),
      );
    return (
      <section className="screen active transaction-screen app-content-page">
        <div className="compact-page-header transaction-page-header">
          <div>
            <p className="compact-page-header__eyebrow">
              Escrow {tx.reference ?? `#${tx.id}`}
            </p>
            <h2>{tx.title}</h2>
            <p>{isCurrentUserBuyer ? "Buyer" : "Seller"} view · {tx.counterpart}</p>
          </div>
        </div>
        <div className="card transaction-hero-card">
          <div className="transaction-summary-rail">
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
              {tx.fundingMode || tx.fundedAmount ? (
                <div className="transaction-summary-field">
                  <div className="muted">Funding</div>
                  <div style={{ fontWeight: 700 }}>
                    {tx.fundingMode === "milestone"
                      ? hasSecuredFunds
                        ? "Staged funding active"
                        : "Staged funding agreed"
                      : hasSecuredFunds
                        ? "Funded in full"
                        : "Full funding agreed"}
                  </div>
                  <div className="muted" style={{ marginTop: 4 }}>
                    {formatCurrency(tx.fundedAmount ?? (tx.fundingStatus === "funded" ? tx.amount : 0))} secured
                    {tx.fundingMode === "milestone" ? ` of ${formatCurrency(tx.amount)}` : ""}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="transaction-download-action">
              <button
                className="ghost agreement-download-button"
                onClick={() => {
                  if (tx.counterpartyApproved) downloadAgreementPdf(tx);
                }}
                disabled={!tx.counterpartyApproved}
                title={tx.counterpartyApproved ? undefined : "Available after counterparty approval"}
              >
                Download agreement
              </button>
            </div>
          </div>
          <details className="transaction-inline-disclosure">
            <summary>
              <span>Buyer and seller</span>
              <small>{tx.buyer} · {tx.seller}</small>
            </summary>
            <div className="transaction-parties">
              <div className="transaction-party">
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
              </div>
              <div className="transaction-party">
                <div className="muted">Seller</div>
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
            </div>
          </details>
          {tx.description ? (
            <details className="transaction-inline-disclosure">
              <summary><span>Description</span></summary>
              <p className="muted transaction-description">{tx.description}</p>
            </details>
          ) : null}
        </div>
        <details className="card transaction-disclosure transaction-chat-disclosure" style={{ marginTop: 12 }}>
          <summary className="transaction-disclosure__summary">
            <span>Messages</span>
            <small>Conversation with {tx.counterpart}</small>
          </summary>
          <div className="transaction-disclosure__body">
            <EscrowChat
              escrowId={String(tx.reference ?? tx.id)}
              counterpart={tx.counterpart}
            />
          </div>
        </details>
        {tx.invitation || tx.agreement ? (
          <details
            className="card agreement-invitation-card transaction-disclosure"
            style={{ marginTop: 12 }}
            open={canRecoverInvitation || undefined}
          >
            <summary className="transaction-disclosure__summary">
              <span>Agreement and invitation</span>
              <small>
                {tx.agreement ? `Version ${tx.agreement.version}` : "Agreement pending"}
                {tx.invitation ? ` · ${tx.invitation.status}` : ""}
              </small>
            </summary>
            <div className="transaction-disclosure__body">
            <div className="transaction-overview agreement-invitation-summary">
              {tx.agreement ? (
                <div className="transaction-summary-field">
                  <div className="muted">Agreement version</div>
                  <div style={{ fontWeight: 700 }}>Version {tx.agreement.version}</div>
                  <div className="muted" style={{ marginTop: 4 }}>
                    {tx.agreement.status === "locked"
                      ? "Locked after both parties signed"
                      : `${tx.agreement.creatorSigned ? "Creator signed" : "Creator signature needed"} · ${tx.agreement.counterpartySigned ? "Counterparty signed" : "Counterparty signature needed"}`}
                  </div>
                </div>
              ) : null}
              {tx.invitation ? (
                <div className="transaction-summary-field">
                  <div className="muted">Invitation</div>
                  <div style={{ fontWeight: 700, textTransform: "capitalize" }}>{tx.invitation.status}</div>
                  <div className="muted" style={{ marginTop: 4 }}>
                    Sent to {tx.invitation.recipient} · response due {formatHistoryDate(tx.invitation.responseDueAt)}
                  </div>
                  {tx.invitation.failureReason ? (
                    <div className="muted" style={{ marginTop: 4 }}>Delivery issue: {tx.invitation.failureReason}</div>
                  ) : null}
                </div>
              ) : null}
            </div>
            {canRecoverInvitation ? (
              <div className="agreement-invitation-actions">
                <button
                  className="btn"
                  onClick={() => handleResendInvitation(tx)}
                  disabled={resendInvitationMutation.isPending}
                >
                  {resendInvitationMutation.isPending ? "Resending..." : "Resend invitation"}
                </button>
                <button
                  className="ghost"
                  onClick={() => handleExtendInvitation(tx)}
                  disabled={extendInvitationMutation.isPending}
                >
                  {extendInvitationMutation.isPending ? "Extending..." : "Extend 7 days"}
                </button>
              </div>
            ) : null}
            {renderInlineMessage(`invitation:${tx.id}`)}
            </div>
          </details>
        ) : null}
        {needsCreatorSignature ? (
          <div className="card" style={{ marginTop: 12 }}>
            <strong>Sign the corrected agreement</strong>
            <p className="muted" style={{ marginTop: 8, marginBottom: 12 }}>
              The terms changed, so earlier signatures no longer apply. Review version {tx.agreement?.version ?? "the latest"} and sign it before the counterparty can approve.
            </p>
            <div className="signature-pad">
              <SignaturePad
                ref={creatorSignaturePadRef}
                resetVersion={creatorSignatureVersion}
                onSignedChange={setCreatorSignatureCaptured}
              />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button
                className="btn"
                onClick={() => handleSignCurrentAgreement(tx)}
                disabled={!creatorSignatureCaptured || signAgreementMutation.isPending}
              >
                {signAgreementMutation.isPending ? "Signing..." : "Sign latest agreement"}
              </button>
              <button
                className="ghost"
                onClick={() => {
                  creatorSignaturePadRef.current?.clear();
                  setCreatorSignatureCaptured(false);
                }}
              >
                Clear
              </button>
            </div>
            {renderInlineMessage(`creator-signature:${tx.id}`)}
          </div>
        ) : null}
        {showFundingPlan ? (
          <div className="card funding-plan" style={{ marginTop: 12 }}>
            <div className="funding-plan__header">
              <div>
                <strong>Funding plan</strong>
                <p className="muted">
                  Fund the whole escrow now or add flexible deposits as the work progresses.
                </p>
              </div>
              {tx.fundingMode ? (
                <span className="milestone-chip milestone-chip--released">
                  {tx.fundingMode === "milestone" ? "Staged funding selected" : "Full funding selected"}
                </span>
              ) : null}
            </div>
            {tx.fundingMode ? (
              <div className="funding-plan__selected">
                <strong>
                  {tx.fundingMode === "milestone"
                    ? "Fund in stages"
                    : "Fund the entire escrow up front"}
                </strong>
                <span className="muted">
                  {tx.fundingMode === "milestone"
                    ? `${formatCurrency(tx.fundedAmount ?? 0)} of ${formatCurrency(tx.amount)} secured`
                    : hasSecuredFunds
                      ? `${formatCurrency(tx.amount)} secured for all milestones`
                      : `${formatCurrency(tx.amount)} will be deposited after both parties sign`}
                </span>
              </div>
            ) : (
              <div className="funding-plan__grid">
                <article className="funding-plan__option">
                  <span className="funding-plan__eyebrow">Traditional</span>
                  <strong>Fund the entire escrow</strong>
                  <span className="funding-plan__amount">{formatCurrency(tx.amount)}</span>
                  <p className="muted">
                    Deposit the full agreement amount now so every milestone is ready.
                  </p>
                  <button
                    className="btn"
                    onClick={() => handleFundEscrow(tx)}
                    disabled={
                      !canFundEscrow
                      || fundEscrowMutation.isPending
                      || walletBalanceDisplay < tx.amount
                    }
                  >
                    {fundEscrowMutation.isPending
                      ? "Funding..."
                      : canFundEscrow
                        ? "Fund entire escrow"
                        : "Available after approval"}
                  </button>
                </article>
                <article className="funding-plan__option funding-plan__option--tiered">
                  <span className="funding-plan__eyebrow">Flexible</span>
                  <strong>Fund in stages</strong>
                  <span className="funding-plan__amount">
                    Choose each deposit
                  </span>
                  <p className="muted">
                    Add any amount. It secures milestones in order and can cover more than one milestone.
                  </p>
                  {canUseMilestoneFunding && canUseStagedFunding && stagedFundingControls
                    ? stagedFundingControls
                    : (
                      <button className="btn" disabled>
                        {!canUseMilestoneFunding || !canUseStagedFunding
                          ? "Backend update pending"
                          : remainingEscrowFunding <= 0
                            ? "Escrow fully funded"
                            : "Available after approval"}
                      </button>
                    )}
                </article>
              </div>
            )}
            {tx.fundingMode === "full" && tx.fundingStatus !== "funded" ? (
              <button
                className="btn"
                style={{ marginTop: 12 }}
                onClick={() => handleFundEscrow(tx)}
                disabled={
                  !canFundEscrow
                  || fundEscrowMutation.isPending
                  || walletBalanceDisplay < tx.amount
                }
              >
                {fundEscrowMutation.isPending
                  ? "Funding..."
                  : canFundEscrow
                    ? "Fund entire escrow"
                    : isCurrentUserBuyer
                      ? "Available after approval"
                      : "Buyer funds after approval"}
              </button>
            ) : null}
            {tx.fundingMode === "milestone" ? stagedFundingControls : null}
            {!tx.fundingMode && !canFundEscrow ? (
              <p className="funding-plan__availability muted">
                You can make this choice as soon as both parties approve and sign the agreement.
              </p>
            ) : null}
            {!tx.fundingMode && canFundEscrow && walletBalanceDisplay < tx.amount ? (
              <p className="funding-plan__availability muted">
                Wallet balance: {formatCurrency(walletBalanceDisplay)}. Full funding needs {formatCurrency(walletShortfall)} more.
                {nextMilestoneToFund
                  ? nextMilestoneShortfall === 0
                    ? " You already have enough to start staged funding."
                    : ` The next milestone needs ${formatCurrency(nextMilestoneShortfall)} more in your wallet.`
                  : ""}
              </p>
            ) : null}
            {renderInlineMessage(`funding:${tx.id}`)}
          </div>
        ) : null}
        {(canFundEscrow || canCancelEscrow || canEditDraftEscrow || canRecoverInvitation || (tx.isOwner && isChangesRequested)) ? (
          <div className="card" style={{ marginTop: 12 }}>
            <strong>Next step</strong>
            <p className="muted" style={{ marginTop: 8, marginBottom: 12 }}>
              {tx.isOwner && isChangesRequested
                  ? "Review the requested agreement changes below."
                : canFundEscrow
                  ? "Choose either full or staged funding in the funding plan above."
                  : isAwaitingSignup
                    ? "This escrow is waiting for the counterparty to finish signup and verification."
                    : isCreatorSignatureRequired
                      ? "Review and sign the latest agreement version before asking the counterparty to approve it."
                    : isRejected
                      ? "Revise and resend this proposal, or close it."
                    : isChangesRequested
                      ? "The escrow creator is reviewing requested milestone changes."
                      : "This draft is still waiting for counterparty approval."}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                  Edit proposal
                </button>
              ) : null}
            </div>
            {renderInlineMessage(`next-step:${tx.id}`)}
            {canEditDraftEscrow && draftEscrowEdit ? (
              <div className="agreement-change-card" style={{ marginTop: 14 }}>
                <div className="agreement-change-card__heading proposal-edit-header">
                  <div>
                    <strong>Edit proposal</strong>
                    <p className="muted" style={{ margin: "4px 0 0" }}>
                      Saving any changes creates a new agreement version and requires fresh signatures.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setDraftEscrowEdit(null)}
                    disabled={updateDraftEscrowMutation.isPending}
                  >
                    Cancel editing
                  </button>
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
                    {updateDraftEscrowMutation.isPending ? "Saving..." : "Save changes and resend"}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setDraftEscrowEdit(null)}
                    disabled={updateDraftEscrowMutation.isPending}
                  >
                    Cancel editing
                  </button>
                </div>
                {renderInlineMessage(`draft-edit:${tx.id}`)}
              </div>
            ) : null}
          </div>
        ) : null}
        {(isAwaitingApproval || isChangesRequested) &&
        tx.milestones.length &&
        !(canRequestMilestoneChanges && agreementChangeDraft) &&
        !(tx.isOwner && isChangesRequested && hasAgreementChangeRequest) ? (
          <details className="card transaction-section-disclosure" style={{ marginTop: 12 }}>
            <summary className="transaction-disclosure__summary">
              <span>Agreement milestones</span>
              <small>{tx.milestones.length} milestone{tx.milestones.length === 1 ? "" : "s"} · {formatCurrency(tx.amount)}</small>
            </summary>
            <div className="transaction-section-disclosure__body">
            <div className="tx-list">
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
          </details>
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
                {renderInlineMessage(`agreement-change:${tx.id}`)}
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
            {renderInlineMessage(`approval:${tx.id}`)}
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
            {renderInlineMessage(`agreement-review:${tx.id}`)}
          </div>
        ) : null}
        {tx.lifecycleStatus === "funded" || tx.cancellation ? (
          <details
            className="card cancellation-card transaction-section-disclosure"
            style={{ marginTop: 12 }}
            open={Boolean(tx.cancellation) || undefined}
          >
            <summary className="transaction-disclosure__summary">
              <span>Cancellation and refunds</span>
              <small>{tx.cancellation ? tx.cancellation.status : "View options"}</small>
            </summary>
            <div className="transaction-section-disclosure__body">
            {tx.cancellation ? (
              <div>
                <div className="milestone-warning">
                  <strong style={{ textTransform: "capitalize" }}>{tx.cancellation.mode} cancellation — {tx.cancellation.status}</strong>
                  <p style={{ margin: "6px 0 0" }}>{tx.cancellation.reason}</p>
                  <div className="muted" style={{ marginTop: 4 }}>
                    Requested {formatDateTime(tx.cancellation.requestedAt)}. Funds do not move until the authorized path completes.
                  </div>
                </div>
                {tx.cancellation.mode === "mutual"
                  && tx.cancellation.status === "pending"
                  && tx.cancellation.requestedById !== currentUserId ? (
                  <button
                    className="btn"
                    style={{ marginTop: 10 }}
                    onClick={() => handleAcceptFundedCancellation(tx.cancellation!.id)}
                    disabled={acceptFundedCancellationMutation.isPending}
                  >
                    {acceptFundedCancellationMutation.isPending ? "Refunding..." : "Accept cancellation and refund available funds"}
                  </button>
                ) : null}
                {renderInlineMessage(`cancellation-action:${tx.cancellation.id}`)}
                {tx.cancellation.mode === "unilateral" ? (
                  <p className="muted" style={{ marginBottom: 0 }}>
                    {["escalated", "information_requested", "information_received"].includes(tx.cancellation.status)
                      ? "Administrative review checks process and documented authority. Contested entitlement must move to the formal dispute workflow; operations does not decide the merits."
                      : tx.cancellation.status === "referred_to_dispute"
                        ? `This request was referred to formal dispute ${tx.cancellation.referredDisputeReference ?? ""}.`
                        : "The administrative cancellation review is closed."}
                  </p>
                ) : null}
                {tx.cancellation.reviewMessages.length ? (
                  <div className="milestone-warning" style={{ marginTop: 10 }}>
                    <strong>Review messages</strong>
                    {tx.cancellation.reviewMessages.map((reviewMessage) => (
                      <div key={reviewMessage.id} className="tx-item" style={{ marginTop: 8 }}>
                        <strong>{reviewMessage.author.name}</strong>
                        <p style={{ margin: "4px 0 0" }}>{reviewMessage.body}</p>
                        <div className="muted" style={{ marginTop: 4 }}>
                          {reviewMessage.kind.replaceAll("_", " ")} · {formatDateTime(reviewMessage.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {tx.cancellation.mode === "unilateral"
                  && ["information_requested", "information_received"].includes(tx.cancellation.status) ? (
                    <div className="cancellation-form" style={{ marginTop: 10 }}>
                      <label className="field cancellation-form__field">
                        <span>Respond with administrative information</span>
                        <textarea
                          rows={3}
                          value={cancellationInformationDrafts[tx.cancellation.id] ?? ""}
                          onChange={(event) => setCancellationInformationDrafts((current) => ({
                            ...current,
                            [tx.cancellation!.id]: event.target.value,
                          }))}
                          placeholder="Answer the request with objective facts and references. Formal dispute evidence is submitted in the dispute workspace."
                        />
                      </label>
                      <button
                        className="ghost cancellation-form__action"
                        onClick={() => handleSubmitCancellationInformation(tx.cancellation!.id)}
                        disabled={submitCancellationInformationMutation.isPending}
                      >
                        {submitCancellationInformationMutation.isPending ? "Submitting..." : "Submit information"}
                      </button>
                      {renderInlineMessage(`cancellation-information:${tx.cancellation.id}`)}
                    </div>
                  ) : null}
                {tx.cancellation.reviewNote ? (
                  <div className="milestone-warning" style={{ marginTop: 10 }}>
                    <strong>Administrative record</strong>
                    <p style={{ margin: "6px 0 0" }}>{tx.cancellation.reviewNote}</p>
                    {tx.cancellation.authorityReference ? (
                      <div className="muted" style={{ marginTop: 4 }}>
                        Authority: {tx.cancellation.authorityType?.replaceAll("_", " ")} · {tx.cancellation.authorityReference}
                      </div>
                    ) : null}
                    {tx.cancellation.proceduralReasonCode ? (
                      <div className="muted" style={{ marginTop: 4 }}>
                        Procedural basis: {tx.cancellation.proceduralReasonCode.replaceAll("_", " ")} · {tx.cancellation.policyReference}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="cancellation-form">
                <p className="muted cancellation-form__intro">
                  A mutual cancellation refunds only unreleased, undisputed funds after the other party accepts. A unilateral request freezes new releases and enters administrative review; contested merits are referred to the formal dispute process.
                </p>
                <label className="field cancellation-form__field">
                  <span>Cancellation path</span>
                  <select
                    value={cancellationDrafts[tx.id]?.mode ?? "mutual"}
                    onChange={(event) => setCancellationDrafts((current) => ({
                      ...current,
                      [tx.id]: {
                        mode: event.target.value as "mutual" | "unilateral",
                        reason: current[tx.id]?.reason ?? "",
                      },
                    }))}
                  >
                    <option value="mutual">Mutual cancellation</option>
                    <option value="unilateral">Unilateral administrative review</option>
                  </select>
                </label>
                <label className="field cancellation-form__field">
                  <span>Reason</span>
                  <textarea
                    rows={2}
                    value={cancellationDrafts[tx.id]?.reason ?? ""}
                    onChange={(event) => setCancellationDrafts((current) => ({
                      ...current,
                      [tx.id]: {
                        mode: current[tx.id]?.mode ?? "mutual",
                        reason: event.target.value,
                      },
                    }))}
                    placeholder="Explain why the escrow should be cancelled"
                  />
                </label>
                <button
                  className="ghost cancellation-form__action"
                  onClick={() => handleRequestFundedCancellation(tx)}
                  disabled={requestFundedCancellationMutation.isPending}
                >
                  {requestFundedCancellationMutation.isPending ? "Requesting..." : "Request cancellation"}
                </button>
                {renderInlineMessage(`cancellation:${tx.id}`)}
              </div>
            )}
            </div>
          </details>
        ) : null}
        {tx.milestones.length && !isAwaitingApproval && !isChangesRequested ? (
          <details
            className="card transaction-section-disclosure"
            style={{ marginTop: 12 }}
            open={milestonesNeedAttention || undefined}
          >
            <summary className="transaction-disclosure__summary">
              <span>Milestones</span>
              <small>{tx.milestones.length} milestone{tx.milestones.length === 1 ? "" : "s"}</small>
            </summary>
            <div className="transaction-section-disclosure__body">
            {!canReviewMilestones ? (
              <div className="muted transaction-section-note">
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
              {tx.milestones.map((milestone, milestoneIndex) => {
                const dispute = activeDisputes.find((item) => item.milestoneId === Number(milestone.id));
                const isFunded = milestoneIsFunded(milestone);
                const earlierWorkflowIsComplete = tx.milestones
                  .slice(0, milestoneIndex)
                  .every((earlierMilestone) =>
                    ["released", "refunded", "settled", "cancelled"].includes(
                      earlierMilestone.status,
                    ));
                const canFundThisMilestone =
                  isCurrentUserBuyer
                  && canUseMilestoneFunding
                  && canUseStagedFunding
                  && tx.fundingMode === "milestone"
                  && nextMilestoneToFund?.id === milestone.id
                  && !isFunded
                  && ["not_started", "revision_requested"].includes(milestone.status);
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
                          : milestone.status === "refunded"
                            ? "Resolved with a full buyer refund"
                          : milestone.status === "settled"
                            ? "Resolved with a split settlement"
                          : milestone.status === "cancelled"
                            ? "Cancelled before release"
                          : milestone.status === "disputed"
                            ? "Disputed — this milestone's funds are reserved"
                          : milestone.status === "revision_requested"
                            ? `Revision requested ${milestone.rejectedAt ? formatHistoryDate(milestone.rejectedAt) : ""}`
                            : milestone.status === "submitted"
                              ? milestone.reviewOverdueAt
                                ? "Buyer review overdue — funds remain held"
                                : `Submitted for review${milestone.reviewDeadline ? ` • Due ${formatHistoryDate(milestone.reviewDeadline)}` : ""}`
                              : "Waiting for seller submission"}
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
                      {tx.fundingMode === "milestone" ? (
                        <div className="muted" style={{ marginTop: 4, fontWeight: 700 }}>
                          {isFunded
                            ? "Fully secured"
                            : (milestone.fundedCents ?? 0) > 0
                              ? `${formatCurrency((milestone.fundedCents ?? 0) / 100)} of ${formatCurrency(milestone.amount)} secured`
                              : "Not secured yet"}
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
                    ) : canFundThisMilestone ? (
                      <div>
                        <button
                          className="btn"
                          onClick={() =>
                            handleFundMilestone(
                              tx,
                              milestone,
                              milestoneFundingRemaining(milestone),
                            )}
                          disabled={
                            fundMilestoneMutation.isPending
                            || walletBalanceDisplay < milestoneFundingRemaining(milestone)
                          }
                        >
                          {fundMilestoneMutation.isPending
                            ? "Adding funds..."
                            : `Secure remaining ${formatCurrency(milestoneFundingRemaining(milestone))}`}
                        </button>
                        {walletBalanceDisplay < milestoneFundingRemaining(milestone) ? (
                          <div className="muted" style={{ marginTop: 6 }}>
                            Top up {formatCurrency(milestoneFundingRemaining(milestone) - walletBalanceDisplay)} to fully secure this milestone.
                          </div>
                        ) : null}
                      </div>
                    ) : milestone.status === "submitted" && isCurrentUserBuyer ? (
                      <div style={{ width: "100%" }}>
                        <label className="field" style={{ marginBottom: 10 }}>
                          <span>Revision reason (required only when requesting changes)</span>
                          <textarea
                            rows={2}
                            value={milestoneRevisionReasons[milestone.id] ?? ""}
                            onChange={(event) => setMilestoneRevisionReasons((current) => ({
                              ...current,
                              [milestone.id]: event.target.value,
                            }))}
                            placeholder="Describe exactly what needs to change"
                          />
                        </label>
                        {renderInlineMessage(`milestone-review:${milestone.id}`)}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            className="btn"
                            onClick={() => handleMilestoneDecision(tx.id, milestone.id, "approve")}
                            disabled={!canReviewMilestones || approveMilestoneMutation.isPending}
                          >
                            {approveMilestoneMutation.isPending ? "Approving..." : "Approve and release"}
                          </button>
                          <button
                            className="ghost"
                            onClick={() => handleMilestoneDecision(tx.id, milestone.id, "reject")}
                            disabled={!canReviewMilestones || rejectMilestoneMutation.isPending}
                          >
                            {rejectMilestoneMutation.isPending ? "Sending..." : "Request revision"}
                          </button>
                        </div>
                      </div>
                    ) : !isFunded
                      && ["not_started", "revision_requested"].includes(milestone.status) ? (
                      <div>
                        <span className="milestone-chip milestone-chip--not_started">
                          {isCurrentUserBuyer
                            ? tx.fundingMode === "milestone"
                              ? "Not fully secured yet"
                              : "Fund this milestone to begin"
                            : "Awaiting buyer funding"}
                        </span>
                        {renderInlineMessage(`milestone-submission:${milestone.id}`)}
                      </div>
                    ) : isFunded
                      && !earlierWorkflowIsComplete
                      && ["not_started", "revision_requested"].includes(milestone.status) ? (
                      <span className="milestone-chip milestone-chip--not_started">
                        Fully secured · waiting for the prior milestone
                      </span>
                    ) : ["not_started", "revision_requested"].includes(milestone.status)
                      && sameEmail(tx.sellerEmail, currentUser.email) ? (
                      <div style={{ width: "100%" }}>
                        <label className="field" style={{ marginBottom: 10 }}>
                          <span>{milestone.status === "revision_requested" ? "Describe what changed" : "Submission note"}</span>
                          <textarea
                            rows={2}
                            value={milestoneSubmissionNotes[milestone.id] ?? ""}
                            onChange={(event) => setMilestoneSubmissionNotes((current) => ({
                              ...current,
                              [milestone.id]: event.target.value,
                            }))}
                            placeholder="Summarize the completed work for the buyer"
                          />
                        </label>
                        <label className="milestone-proof-picker">
                          <span className="milestone-proof-picker__title">Proof of completion</span>
                          <span className="milestone-proof-picker__help">
                            Add receipts, photos, PDFs, Word files, spreadsheets, or text files.
                          </span>
                          <input
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/rtf"
                            onChange={(event) => handleMilestoneProofSelection(milestone.id, event.target.files)}
                          />
                          <span className="milestone-proof-picker__help">Up to 10 files, 25 MB each.</span>
                        </label>
                        {(milestoneProofFiles[milestone.id] ?? []).length ? (
                          <div className="milestone-proof-list" aria-label="Selected proof files">
                            {(milestoneProofFiles[milestone.id] ?? []).map((file, index) => (
                              <div className="milestone-proof-file" key={`${file.name}-${file.lastModified}-${index}`}>
                                <span>
                                  <strong>{file.name}</strong>
                                  <small>{formatFileSize(file.size)}</small>
                                </span>
                                <button
                                  type="button"
                                  className="ghost"
                                  onClick={() => setMilestoneProofFiles((current) => ({
                                    ...current,
                                    [milestone.id]: (current[milestone.id] ?? []).filter((_, fileIndex) => fileIndex !== index),
                                  }))}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {renderInlineMessage(`milestone-submission:${milestone.id}`)}
                        <button
                          className="btn"
                          style={{ marginTop: 10 }}
                          onClick={() => handleMilestoneSubmit(tx.id, milestone.id)}
                          disabled={submitMilestoneMutation.isPending}
                        >
                          {submitMilestoneMutation.isPending
                            ? "Submitting..."
                            : milestone.status === "revision_requested" ? "Resubmit work" : "Submit work"}
                        </button>
                      </div>
                    ) : (
                      <span className={`milestone-chip milestone-chip--${milestone.status}`}>
                        {milestone.status === "released"
                          ? "Approved"
                          : milestone.status === "refunded"
                            ? "Refunded"
                          : milestone.status === "settled"
                            ? "Settled"
                          : milestone.status === "cancelled"
                            ? "Cancelled"
                          : milestone.status === "disputed"
                            ? "Dispute open"
                          : milestone.status === "submitted"
                            ? "Awaiting buyer review"
                            : milestone.status === "revision_requested"
                              ? "Awaiting seller revision"
                              : "Not started"}
                      </span>
                    )}
                  </div>
                  {["submitted", "revision_requested"].includes(milestone.status) && canReviewMilestones ? (
                    <div className="milestone-warning" style={{ marginTop: 12 }}>
                      <strong>Disagree about this milestone?</strong>
                      <p className="muted" style={{ margin: "4px 0 8px" }}>
                        Either party can open a dispute. Only this milestone&apos;s remaining balance will be reserved.
                      </p>
                      <label className="field">
                        <span>Dispute reason</span>
                        <textarea
                          rows={2}
                          value={milestoneDisputeReasons[milestone.id] ?? ""}
                          onChange={(event) => setMilestoneDisputeReasons((current) => ({
                            ...current,
                            [milestone.id]: event.target.value,
                          }))}
                          placeholder="Explain the specific disagreement"
                        />
                      </label>
                      {renderInlineMessage(`milestone-dispute:${milestone.id}`)}
                      <button
                        className="ghost"
                        style={{ marginTop: 8 }}
                        onClick={() => handleOpenMilestoneDispute(tx, milestone.id)}
                        disabled={openMilestoneDisputeMutation.isPending}
                      >
                        {openMilestoneDisputeMutation.isPending ? "Opening..." : "Open milestone dispute"}
                      </button>
                    </div>
                  ) : null}
                  {milestone.status === "disputed" ? (
                    <div className="milestone-warning" style={{ marginTop: 12 }}>
                      <strong>Dispute workspace{dispute ? ` • ${dispute.id}` : ""}</strong>
                      {disputesQuery.isLoading ? <p className="muted">Loading dispute details...</p> : null}
                      {dispute ? (
                        <>
                          <p style={{ margin: "8px 0 4px" }}>{dispute.reason}</p>
                          <div className="muted">
                            {formatCurrency(dispute.amountFrozenCents / 100)} reserved
                            {dispute.evidenceWindowEndsAt
                              ? ` • Evidence due ${formatDateTime(dispute.evidenceWindowEndsAt)}`
                              : ""}
                          </div>
                          {dispute.evidence.length ? (
                            <div style={{ marginTop: 10 }}>
                              <strong>Evidence history</strong>
                              {dispute.evidence.map((evidence) => (
                                <div key={evidence.id} className="tx-item" style={{ marginTop: 6 }}>
                                  <div>
                                    <div>{evidence.note || "Evidence references added"}</div>
                                    <div className="muted">
                                      {evidence.submitter.name} • {formatDateTime(evidence.submittedAt)}
                                    </div>
                                    {evidence.references.length ? (
                                      <div className="muted">
                                        Files: {evidence.references.map((item) =>
                                          `${item.fileName}${item.storageStatus === "managed" ? " (stored)" : " (metadata only)"}`).join(", ")}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {dispute.status !== "arbitration_requested" ? (
                            <>
                              <label className="field" style={{ marginTop: 10 }}>
                                <span>Add evidence note (optional with files)</span>
                                <textarea
                                  rows={2}
                                  value={disputeEvidenceNotes[dispute.id] ?? ""}
                                  onChange={(event) => setDisputeEvidenceNotes((current) => ({
                                    ...current,
                                    [dispute.id]: event.target.value,
                                  }))}
                                  placeholder="Add facts, dates, or a summary of supporting material"
                                />
                              </label>
                              <label className="field" style={{ marginTop: 10 }}>
                                <span>Evidence files</span>
                                <input
                                  key={`${dispute.id}-${disputeEvidenceInputVersions[dispute.id] ?? 0}`}
                                  type="file"
                                  multiple
                                  accept=".pdf,.doc,.docx,.rtf,.xls,.xlsx,.heic,.heif,.jpg,.jpeg,.png,.webp,.csv,.txt"
                                  onChange={(event) => {
                                    const files = Array.from(event.target.files ?? []);
                                    setDisputeEvidenceFiles((current) => ({ ...current, [dispute.id]: files }));
                                  }}
                                />
                                <span className="muted">Up to 10 files, 25 MB each, 100 MB total.</span>
                                {(disputeEvidenceFiles[dispute.id] ?? []).length ? (
                                  <span className="muted">
                                    Selected: {(disputeEvidenceFiles[dispute.id] ?? []).map((file) => file.name).join(", ")}
                                  </span>
                                ) : null}
                              </label>
                              {renderInlineMessage(`dispute-evidence:${dispute.id}`)}
                              <button
                                className="ghost"
                                style={{ marginTop: 8 }}
                                onClick={() => handleSubmitDisputeEvidence(dispute.id)}
                                disabled={submitDisputeEvidenceMutation.isPending}
                              >
                                {submitDisputeEvidenceMutation.isPending ? "Adding..." : "Add dispute evidence"}
                              </button>
                            </>
                          ) : null}
                          {dispute.status === "arbitration_requested" ? (
                            <div className="tx-item" style={{ marginTop: 12 }}>
                              <div>
                                <strong>Arbitration requested</strong>
                                <div className="muted">
                                  The evidence and dispute are awaiting arbitration review. The disputed funds remain reserved.
                                </div>
                                {dispute.arbitrationRequestedAt ? (
                                  <div className="muted" style={{ marginTop: 4 }}>
                                    Requested {formatDateTime(dispute.arbitrationRequestedAt)}
                                  </div>
                                ) : null}
                                <button
                                  className="ghost"
                                  style={{ marginTop: 10 }}
                                  onClick={() => router.push(
                                    `/disputes/${encodeURIComponent(dispute.id)}/arbitration-report`,
                                  )}
                                >
                                  View or download arbitration report
                                </button>
                              </div>
                            </div>
                          ) : dispute.resolution ? (
                            <div className="tx-item" style={{ marginTop: 12 }}>
                              <div>
                                <strong>Complete resolution proposal</strong>
                                <div className="muted">
                                  Seller {formatCurrency(dispute.resolution.sellerCents / 100)} • Buyer {formatCurrency(dispute.resolution.buyerCents / 100)}
                                </div>
                                {dispute.resolution.note ? <div style={{ marginTop: 4 }}>{dispute.resolution.note}</div> : null}
                              </div>
                              {dispute.resolution.proposedById !== currentUserId ? (
                                <button
                                  className="btn"
                                  onClick={() => handleAcceptDisputeResolution(dispute.id)}
                                  disabled={resolveDisputeMutation.isPending}
                                >
                                  {resolveDisputeMutation.isPending ? "Allocating..." : "Accept and allocate funds"}
                                </button>
                              ) : <span className="muted">Waiting for the other party</span>}
                              <button
                                className="ghost"
                                style={{ marginTop: 8 }}
                                onClick={() => handleRequestDisputeArbitration(dispute.id)}
                                disabled={requestDisputeArbitrationMutation.isPending}
                              >
                                {requestDisputeArbitrationMutation.isPending ? "Requesting..." : "Request arbitration"}
                              </button>
                            </div>
                          ) : (
                            <div style={{ marginTop: 12 }}>
                              <strong>Propose a complete allocation</strong>
                              <p className="muted" style={{ margin: "4px 0 8px" }}>
                                Seller and buyer amounts must total {formatCurrency(dispute.amountFrozenCents / 100)}.
                              </p>
                              <div className="form-grid">
                                <label className="field">
                                  <span>To seller</span>
                                  <input
                                    inputMode="decimal"
                                    value={disputeResolutionDrafts[dispute.id]?.sellerAmount ?? ""}
                                    onChange={(event) => setDisputeResolutionDrafts((current) => ({
                                      ...current,
                                      [dispute.id]: {
                                        sellerAmount: event.target.value,
                                        buyerAmount: current[dispute.id]?.buyerAmount ?? "",
                                        note: current[dispute.id]?.note ?? "",
                                      },
                                    }))}
                                  />
                                </label>
                                <label className="field">
                                  <span>To buyer</span>
                                  <input
                                    inputMode="decimal"
                                    value={disputeResolutionDrafts[dispute.id]?.buyerAmount ?? ""}
                                    onChange={(event) => setDisputeResolutionDrafts((current) => ({
                                      ...current,
                                      [dispute.id]: {
                                        sellerAmount: current[dispute.id]?.sellerAmount ?? "",
                                        buyerAmount: event.target.value,
                                        note: current[dispute.id]?.note ?? "",
                                      },
                                    }))}
                                  />
                                </label>
                              </div>
                              {renderInlineMessage(`dispute-resolution:${dispute.id}`)}
                              <label className="field" style={{ marginTop: 8 }}>
                                <span>Resolution note</span>
                                <textarea
                                  rows={2}
                                  value={disputeResolutionDrafts[dispute.id]?.note ?? ""}
                                  onChange={(event) => setDisputeResolutionDrafts((current) => ({
                                    ...current,
                                    [dispute.id]: {
                                      sellerAmount: current[dispute.id]?.sellerAmount ?? "",
                                      buyerAmount: current[dispute.id]?.buyerAmount ?? "",
                                      note: event.target.value,
                                    },
                                  }))}
                                />
                              </label>
                              <button
                                className="btn"
                                style={{ marginTop: 8 }}
                                onClick={() => handleProposeDisputeResolution(dispute.id)}
                                disabled={proposeDisputeResolutionMutation.isPending}
                              >
                                {proposeDisputeResolutionMutation.isPending ? "Proposing..." : "Propose allocation"}
                              </button>
                              {dispute.evidence.length > 0 ? (
                                <button
                                  className="ghost"
                                  style={{ marginTop: 8, marginLeft: 8 }}
                                  onClick={() => handleRequestDisputeArbitration(dispute.id)}
                                  disabled={requestDisputeArbitrationMutation.isPending}
                                >
                                  {requestDisputeArbitrationMutation.isPending ? "Requesting..." : "Request arbitration"}
                                </button>
                              ) : null}
                            </div>
                          )}
                          {renderInlineMessage(`dispute-actions:${dispute.id}`)}
                        </>
                      ) : (
                        <p className="muted">Dispute details are unavailable. Refresh to try again.</p>
                      )}
                    </div>
                  ) : null}
                  {(milestone.submissions ?? []).length ? (
                    <div style={{ marginTop: 14, borderTop: "1px solid #dce9e7", paddingTop: 12 }}>
                      <strong>Submission history</strong>
                      <div className="tx-list" style={{ marginTop: 8 }}>
                        {[...(milestone.submissions ?? [])].reverse().map((submission) => (
                          <div className="tx-item" key={submission.id} style={{ alignItems: "flex-start" }}>
                            <div>
                              <strong>Submission {submission.submissionNumber}</strong>
                              <div className="muted">
                                {submission.submitter.name} • {formatDateTime(submission.submittedAt)}
                              </div>
                              {submission.note ? <p style={{ margin: "6px 0 0" }}>{submission.note}</p> : null}
                              {submission.evidence.length ? (
                                <div className="milestone-proof-history">
                                  <span className="muted">Proof files</span>
                                  {submission.evidence.map((item) => item.storageStatus === "managed" ? (
                                    <button
                                      type="button"
                                      className="milestone-proof-download"
                                      key={item.id}
                                      onClick={() => handleDownloadMilestoneProof(
                                        tx,
                                        milestone,
                                        submission.id,
                                        item.id,
                                        item.fileName,
                                      )}
                                    >
                                      <span>{item.fileName}</span>
                                      <small>{formatFileSize(item.sizeBytes)} • Download</small>
                                    </button>
                                  ) : (
                                    <div className="milestone-proof-download" key={item.id}>
                                      <span>{item.fileName}</span>
                                      <small>{formatFileSize(item.sizeBytes)} • Legacy metadata only</small>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              {submission.review ? (
                                <div className="milestone-warning" style={{ marginTop: 8 }}>
                                  <strong>{submission.review.decision === "approved" ? "Approved" : "Revision requested"}</strong>
                                  {submission.review.reason ? <div style={{ marginTop: 4 }}>{submission.review.reason}</div> : null}
                                  <div className="muted" style={{ marginTop: 4 }}>
                                    {submission.review.reviewer.name} • {formatDateTime(submission.review.reviewedAt)}
                                  </div>
                                </div>
                              ) : (
                                <div className="muted" style={{ marginTop: 6 }}>
                                  Review due {formatDateTime(submission.reviewDeadline)}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      {renderInlineMessage(`proof-download:${milestone.id}`)}
                    </div>
                  ) : null}
                </div>
                );
              })}
            </div>
            </div>
          </details>
        ) : null}
        {tx.timeline.length ? (
          <details className="card transaction-section-disclosure" style={{ marginTop: 12 }}>
            <summary className="transaction-disclosure__summary">
              <span>Timeline</span>
              <small>{tx.timeline.length} event{tx.timeline.length === 1 ? "" : "s"}</small>
            </summary>
            <div className="transaction-section-disclosure__body">
            <div className="tx-list">
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
          </details>
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
    if (isCreationScreen(activeScreen) && user?.id && draftHydratedUserId !== user.id) {
      return (
        <section className="screen active wizard-screen">
          <div className="card" role="status">Restoring your saved draft…</div>
        </section>
      );
    }
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
      case "transactions":
        return renderTransactions();
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
        primaryLabel={hasCreationDraft ? "Resume draft" : "New escrow"}
        onPrimaryClick={beginOrResumeCreation}
        onBrandClick={() => navigate("welcome")}
        onSettingsClick={() => navigate("settings")}
        onLogoutClick={handleLogout}
        onAlertsClick={handleAlertsClick}
      />
      <main ref={mainContentRef} className="app-main" tabIndex={-1}>
        {message && !messageLocation ? (
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
                onClick={() => item.id === "create" ? beginOrResumeCreation() : navigate(item.id)}
              >
                {item.id === "create" && hasCreationDraft ? "Resume" : item.label}
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
        <Image
          className="splash-logo"
          src="/myescrow-logo.png"
          alt="MyEscrow"
          width={1254}
          height={1254}
        />
      </div>
    </main>
  );
}

export default function Home(props: HomeProps) {
  return (
    <CustomerPortalBoundary fallback={<SplashScreen />}>
      {liveDashboardEnabled
        ? <LiveDashboard />
        : <MockExperienceHome searchParams={props.searchParams} />}
    </CustomerPortalBoundary>
  );
}
