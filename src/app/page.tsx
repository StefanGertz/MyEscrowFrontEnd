"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import {
  useApproveEscrow,
  useCreateEscrow,
  useNotifications,
  useRejectEscrow,
  useWalletTopup,
  useWalletWithdraw,
} from "@/hooks/useDashboardData";
import { useToast } from "@/components/ToastProvider";
import { useAuth } from "@/components/AuthProvider";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";

type ScreenId =
  | "welcome"
  | "dashboard"
  | "create"
  | "milestones"
  | "agreement"
  | "wallet"
  | "history"
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
  title: string;
  description?: string;
  counterpart: string;
  amount: number;
  status: "Pending" | "Active" | "Released" | "Resolved" | "Cancelled";
  context: string;
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
};

type HomeProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const screenIds: ScreenId[] = [
  "welcome",
  "dashboard",
  "create",
  "milestones",
  "agreement",
  "wallet",
  "history",
  "settings",
  "transaction",
];

const pickQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const isScreenId = (value: string | undefined): value is ScreenId =>
  value ? screenIds.includes(value as ScreenId) : false;

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
    status: "Released",
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
    label: "Funds released to Summit Legal",
    detail: "Yesterday - Final payout sent",
  },
  {
    id: "dash-tl-2",
    label: "Ops review for Cloud Harbor",
    detail: "Due tomorrow - Pending milestone approval",
  },
  {
    id: "dash-tl-3",
    label: "Buyer funding required",
    detail: "Northwind agency launch - Waiting for deposit",
  },
];

const bottomNav: Array<{ id: ScreenId; label: string }> = [
  { id: "welcome", label: "Home" },
  { id: "dashboard", label: "Dashboard" },
  { id: "create", label: "Create" },
  { id: "wallet", label: "Wallet" },
  { id: "settings", label: "Settings" },
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

const randomId = () => Math.random().toString(36).slice(2, 9);

export default function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = use(searchParams);
  const initialScreenQuery = pickQueryValue(resolvedSearchParams?.screen);
  const initialScreen = isScreenId(initialScreenQuery) ? initialScreenQuery : "welcome";
  const initialTxQuery = pickQueryValue(resolvedSearchParams?.tx);
  const initialTxId = initialTxQuery ? Number(initialTxQuery) : undefined;
  const router = useRouter();
  const { user: authUser, isAuthenticated, isHydrating } = useAuth();
  const [activeScreen, setActiveScreen] = useState<ScreenId>(initialScreen);
  const [walletBalance, setWalletBalance] = useState(300);
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const transactionsRef = useRef(transactions);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(() => {
    if (initialScreen === "transaction" && initialTxId) {
      return initialTransactions.find((item) => item.id === initialTxId) ?? null;
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
  const [walletAmountInput, setWalletAmountInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState({ name: defaultUser.name, email: defaultUser.email });
  const currentUser = profile;
  const [kycMarked, setKycMarked] = useState(false);
  const [modalContent, setModalContent] = useState<ModalContent | null>(null);
  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState(false);
  const createEscrowMutation = useCreateEscrow();
  const approveEscrow = useApproveEscrow();
  const rejectEscrow = useRejectEscrow();
  const notificationsQuery = useNotifications();
  const { pushToast } = useToast();
  const { confirm } = useConfirmDialog();
  const walletTopup = useWalletTopup();
  const walletWithdraw = useWalletWithdraw();

  const pendingCard = useMemo(
    () => transactions.find((tx) => tx.status === "Pending"),
    [transactions],
  );

  const activeNotifications = useMemo(
    () => transactions.filter((tx) => tx.status !== "Released").length,
    [transactions],
  );
  const notificationList = notificationsQuery.data?.notifications ?? [];
  const fallbackNotifications = useMemo<NotificationEntry[]>(() => {
    const entries: NotificationEntry[] = [];
    transactions.forEach((tx) => {
      if (tx.status === "Pending" && !tx.counterpartyApproved) {
        const waitingOnName =
          tx.buyer === currentUser.name ? tx.seller : tx.buyer;
        entries.push({
          id: `approval-${tx.id}`,
          label: tx.title,
          detail: `Waiting for ${waitingOnName} to approve the escrow before funding begins.`,
          meta: tx.context,
        });
      } else if (tx.status === "Active") {
        const pendingMilestone = tx.milestones.find(
          (milestone) => milestone.status === "pending",
        );
        if (pendingMilestone) {
          const needsApprovalFrom =
            tx.seller === currentUser.name ? tx.buyer : tx.seller;
          entries.push({
            id: `milestone-${tx.id}-${pendingMilestone.id}`,
            label: tx.title,
            detail: `${needsApprovalFrom} is reviewing "${pendingMilestone.title}" before funds release.`,
            meta: `Milestone pending • ${pendingMilestone.amount ? formatCurrency(pendingMilestone.amount) : "Review required"}`,
          });
        }
      }
    });
    if (entries.length === 0) {
      entries.push({
        id: "fallback-none",
        label: "All escrows are current",
        detail: "You’ll see alerts here as soon as a buyer or seller needs action.",
        meta: "Status check",
      });
    }
    return entries.slice(0, 4);
  }, [transactions]);
  const shouldUseFallbackNotifications = notificationsQuery.isError || notificationList.length === 0;
  const notificationsToRender = shouldUseFallbackNotifications ? fallbackNotifications : notificationList;
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
  }
  if (pushHistory) {
    const nextUrl = screen === "welcome" ? "/" : `/?screen=${screen}`;
    window.history.pushState({ screen }, "", nextUrl);
  }
};

const viewTransaction = (tx: Transaction) => {
  setSelectedTransaction(tx);
  setMessage(null);
  window.history.pushState({ screen: "transaction", txId: tx.id }, "", `/?screen=transaction&tx=${tx.id}`);
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
  const handlePopState = (event: PopStateEvent) => {
    const params = new URLSearchParams(window.location.search);
    const fallbackScreen = (params.get("screen") as ScreenId) || "welcome";
    const fallbackTx = params.get("tx");
    const state = (event.state || {}) as { screen?: ScreenId; txId?: number };
    const screenFromState = state.screen || fallbackScreen;
    const txFromState = state.txId ?? (fallbackTx ? Number(fallbackTx) : undefined);
    setActiveScreen(screenFromState);
    if (screenFromState === "transaction" && txFromState) {
      setSelectedTransaction(transactionsRef.current.find((item) => item.id === txFromState) ?? null);
    } else if (screenFromState !== "transaction") {
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
    try {
      const response = await createEscrowMutation.mutateAsync({
        title: responseTitle,
        counterpart: createForm.counterpartyName || "Counterparty",
        amount: escrowAmount,
        category: createForm.category,
        description: descriptionValue || undefined,
      });
      const timestamp = new Date().toISOString();
      const newTx: Transaction = {
        id: response.escrowId ?? Math.floor(10000 + Math.random() * 90000),
        title: responseTitle,
        counterpart: createForm.role === "buyer" ? sellerInfo.name : buyerInfo.name,
        amount: escrowAmount,
        status: "Pending",
        context: approvalContext,
        counterpartyApproved: false,
        description: descriptionValue || undefined,
        steps: [
          { title: "Agreement drafted", detail: "Creator signed the agreement", status: "complete" },
          { title: "Awaiting approval", detail: approvalDetail, status: "active" },
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
            label: "Awaiting approval",
            detail: `${createForm.counterpartyName || "Counterparty"} notified to review`,
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
      setMessage("Escrow drafted. Funding will start after both parties sign.");
      navigate("dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create escrow. Try again shortly.");
    }
  };

  const handleApprove = async (tx: Transaction) => {
    try {
      await approveEscrow.mutateAsync({ escrowId: String(tx.id) });
      updateTransaction(tx.id, (current) => ({
        ...current,
        status: "Active",
        context: "Milestones active",
        counterpartyApproved: true,
      }));
      setMessage(`Escrow ${tx.id} approved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to approve escrow.");
    }
  };

  const handleReject = async (tx: Transaction) => {
    try {
      await rejectEscrow.mutateAsync({ escrowId: String(tx.id) });
      updateTransaction(tx.id, (current) => ({
        ...current,
        status: "Pending",
        context: "Rejected - waiting on changes",
        counterpartyApproved: false,
      }));
      setMessage(`Escrow ${tx.id} rejected.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to reject escrow.");
    }
  };

  const handleMilestoneDecision = (txId: number, milestoneId: string, decision: "approve" | "reject") => {
    const target = transactionsRef.current.find((item) => item.id === txId);
    if (!target) {
      setMessage("Transaction not found.");
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
          status = "Released";
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
    if (amount > walletBalance) {
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

  const closeNotificationsPanel = () => {
    setNotificationsPanelOpen(false);
  };

  const findTransactionForNotification = (notification: NotificationEntry) => {
    const text = `${notification.label} ${notification.detail}`.toLowerCase();
    return transactions.find(
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
          <div style={{ fontWeight: 800, fontSize: 18 }}>{formatCurrency(walletBalance)}</div>
          <button className="ghost" onClick={() => navigate("wallet")}>
            Manage
          </button>
        </div>
        <div className="tile">
          <div className="t-title">Recent</div>
          <div className="muted">Last activity</div>
          <div className="muted">
            {transactions.length ? `${transactions[0].title} - ${formatCurrency(transactions[0].amount)}` : "No activity"}
          </div>
        </div>
        <div className="tile">
          <div className="t-title">Active</div>
          <div className="muted">Ongoing escrows</div>
          <button className="ghost" onClick={() => navigate("dashboard")}>
            View
          </button>
        </div>
        <div className="tile">
          <div className="t-title">Support</div>
          <div className="muted">Help & docs</div>
          <button className="ghost" onClick={openSupportModal}>
            Contact
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
            {transactions.map((tx) => (
              <button key={tx.id} className="tx-item tx-item-button" type="button" onClick={() => viewTransaction(tx)}>
                <div>
                  <div style={{ fontWeight: 700 }}>{tx.title}</div>
                  <div className="muted">{tx.counterpart}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div>{formatCurrency(tx.amount)}</div>
                  <span
                    className={`status-badge ${
                      tx.status === "Released"
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
        <div className="tile">
          <div className="t-title">Notifications</div>
          <div className="muted">Open items</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{openNotifications}</div>
        </div>
        <div className="tile">
          <div className="t-title">Wallet</div>
          <div className="muted">Available balance</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{formatCurrency(walletBalance)}</div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 12 }}>
        <strong>Transactions</strong>
        <div className="tx-list" style={{ marginTop: 12 }}>
          {transactions.map((tx) => (
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
                <div className="flex flex-wrap gap-2 justify-end mt-2">
                  {tx.status === "Pending" ? (
                    <>
                      <button
                        className="btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleApprove(tx);
                        }}
                        disabled={approveEscrow.isPending}
                      >
                        {approveEscrow.isPending ? "Approving..." : "Approve"}
                      </button>
                      <button
                        className="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleReject(tx);
                        }}
                        disabled={rejectEscrow.isPending}
                      >
                        {rejectEscrow.isPending ? "Rejecting..." : "Reject"}
                      </button>
                    </>
                  ) : null}
                </div>
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
          {dashboardTimelineEntries.map((event) => (
            <div key={event.id} className="tx-item timeline-entry-card">
              <div>
                <div style={{ fontWeight: 700 }}>{event.label}</div>
                <div className="muted">{event.detail}</div>
              </div>
            </div>
          ))}
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
        <div style={{ fontWeight: 800, fontSize: 18 }}>{formatCurrency(walletBalance)}</div>
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
        {transactions
          .filter((tx) => tx.status === "Released")
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
    if (!selectedTransaction) {
      return (
        <section className="screen active">
          <h2 className="page-title">Transaction</h2>
          <div className="card">
            <p className="muted">Select a transaction from the dashboard to view its details.</p>
          </div>
        </section>
      );
    }
    const tx = selectedTransaction;
    const canReviewMilestones = tx.counterpartyApproved && tx.status === "Active";
    const isCurrentUserBuyer = currentUser.name === tx.buyer;
    const counterpartCopy = isCurrentUserBuyer ? "the seller" : "the buyer";
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
                    tx.status === "Released"
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
              <div className="muted" style={{ marginTop: 8 }}>
                {tx.context}
              </div>
            </div>
          </div>
        </div>
        {tx.milestones.length ? (
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <strong>Milestones</strong>
            </div>
            {!canReviewMilestones ? (
              <div className="muted" style={{ marginTop: 8 }}>
                Waiting on {isCurrentUserBuyer ? "the seller to approve" : "the buyer to approve and fund"} the escrow before milestone decisions can be made.
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
                        <button
                          className="btn"
                          onClick={() => handleMilestoneDecision(tx.id, milestone.id, "approve")}
                          disabled={!canReviewMilestones}
                        >
                          Approve
                        </button>
                        <button
                          className="ghost"
                          onClick={() => handleMilestoneDecision(tx.id, milestone.id, "reject")}
                          disabled={!canReviewMilestones}
                        >
                          Reject
                        </button>
                      </>
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
        onSupportClick={openSupportModal}
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
                {notificationsToRender.map((item) => (
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
                    </div>
                    <div className="notif-detail">{item.detail}</div>
                    <div className="notif-meta">{item.meta}</div>
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
