"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import {
  useApproveEscrow,
  useCancelEscrow,
  useCreateEscrow,
  useNotifications,
  useRejectEscrow,
  useWalletTopup,
  useWalletWithdraw,
} from "@/hooks/useDashboardData";

type ScreenId =
  | "welcome"
  | "dashboard"
  | "create"
  | "milestones"
  | "agreement"
  | "funding"
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
};

type DraftMilestone = {
  id: string;
  title: string;
  amount: number;
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

const currentUser = {
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
    buyer: currentUser.name,
    buyerEmail: currentUser.email,
    seller: "Nora Studio",
    sellerEmail: "nora@example.com",
    milestones: [{ id: "m10105a", title: "Prototype delivery (Northwind)", amount: 650, status: "pending" }],
    timeline: [
      { id: "tl-10105-a", label: "Created", detail: "Created by Scott (buyer)", time: new Date(Date.now() - 3600 * 1000 * 6).toISOString() },
      { id: "tl-10105-b", label: "Seller notified", detail: "Nora invited to approve", time: new Date(Date.now() - 3600 * 1000 * 5.5).toISOString() },
    ],
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
    seller: currentUser.name,
    sellerEmail: currentUser.email,
    milestones: [
      { id: "m10102a", title: "Design draft", amount: 400, status: "released", releasedAt: new Date(Date.now() - 864e5 * 1).toISOString() },
      { id: "m10102b", title: "Development sprint", amount: 400, status: "pending" },
      { id: "m10102c", title: "Final handoff", amount: 400, status: "pending" },
    ],
    timeline: [
      { id: "tl-10102-a", label: "Created", detail: "Created by Scott (seller)", time: new Date(Date.now() - 864e5 * 4).toISOString() },
      { id: "tl-10102-b", label: "Funded", detail: "Buyer funded escrow", time: new Date(Date.now() - 864e5 * 1.5).toISOString() },
      { id: "tl-10102-c", label: "Milestone released", detail: '"Design draft" released', time: new Date(Date.now() - 864e5 * 1).toISOString() },
    ],
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
    buyer: currentUser.name,
    buyerEmail: currentUser.email,
    seller: "Summit Legal",
    sellerEmail: "legal@summit.com",
    milestones: [
      { id: "m10103a", title: "Prototype submitted", amount: 150, status: "released", releasedAt: new Date(Date.now() - 864e5 * 4.5).toISOString() },
      { id: "m10103b", title: "Client approval", amount: 150, status: "released", releasedAt: new Date(Date.now() - 864e5 * 4).toISOString() },
    ],
    timeline: [
      { id: "tl-10103-a", label: "Created", detail: "Created by Scott (buyer)", time: new Date(Date.now() - 864e5 * 7).toISOString() },
      { id: "tl-10103-b", label: "Delivered", detail: "Milestones delivered", time: new Date(Date.now() - 864e5 * 5).toISOString() },
      { id: "tl-10103-c", label: "Closed", detail: "Escrow closed", time: new Date(Date.now() - 864e5 * 3.5).toISOString() },
    ],
  },
];

const dashboardTimelineEntries = [
  {
    id: "dash-tl-1",
    label: "Funds released to Summit Legal",
    detail: "Yesterday · Final payout sent",
  },
  {
    id: "dash-tl-2",
    label: "Ops review for Cloud Harbor",
    detail: "Due tomorrow · Pending milestone approval",
  },
  {
    id: "dash-tl-3",
    label: "Buyer funding required",
    detail: "Northwind agency launch · Waiting for deposit",
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

export default function Home() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>(() => {
    if (typeof window === "undefined") {
      return "welcome";
    }
    const params = new URLSearchParams(window.location.search);
    return (params.get("screen") as ScreenId) || "welcome";
  });
  const [walletBalance, setWalletBalance] = useState(300);
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const transactionsRef = useRef(transactions);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const params = new URLSearchParams(window.location.search);
    const screenParam = (params.get("screen") as ScreenId) || "welcome";
    if (screenParam !== "transaction") {
      return null;
    }
    const txParam = params.get("tx");
    if (!txParam) {
      return null;
    }
    const txId = Number(txParam);
    return initialTransactions.find((item) => item.id === txId) ?? null;
  });
  const [walletHistory, setWalletHistory] = useState<WalletHistoryEntry[]>(initialWalletHistory);
  const [createForm, setCreateForm] = useState({
    role: "buyer" as "buyer" | "seller",
    counterpartyName: "",
    counterpartyEmail: "",
    amount: "",
    category: "Goods",
  });
  const [milestones, setMilestones] = useState<DraftMilestone[]>([]);
  const [milestoneInputs, setMilestoneInputs] = useState({ title: "", amount: "" });
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [signatureCaptured, setSignatureCaptured] = useState(false);
  const [signatureVersion, setSignatureVersion] = useState(0);
  const signaturePadRef = useRef<SignaturePadHandle | null>(null);
  const [fundInput, setFundInput] = useState("");
  const [walletAmountInput, setWalletAmountInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState({ name: currentUser.name, email: currentUser.email });
  const [kycMarked, setKycMarked] = useState(false);
  const [modalContent, setModalContent] = useState<ModalContent | null>(null);
  const [isToolbarHidden, setToolbarHidden] = useState(false);
  const lastScrollYRef = useRef(0);
  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState(false);
  const createEscrowMutation = useCreateEscrow();
  const approveEscrow = useApproveEscrow();
  const rejectEscrow = useRejectEscrow();
  const cancelEscrow = useCancelEscrow();
  const notificationsQuery = useNotifications();
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
const fallbackNotifications: NotificationEntry[] = [
  {
    id: "demo-notif-01",
    label: "Northwind onboarding kit",
    detail: "Review and approve the Northwind onboarding kit escrow to move forward.",
    meta: "Just now",
  },
  {
    id: "demo-notif-02",
    label: "Cloud Harbor retainer",
    detail: "Milestone \"Development sprint\" is ready for your approval.",
    meta: "15 min ago",
  },
  {
    id: "demo-notif-03",
    label: "Summit Legal payout",
    detail: "Final milestone released and payout sent to Summit Legal.",
    meta: "1 hr ago",
  },
];
  const shouldUseFallbackNotifications = notificationsQuery.isError || notificationList.length === 0;
  const notificationsToRender = shouldUseFallbackNotifications ? fallbackNotifications : notificationList;
  const openNotifications = notificationList.length || activeNotifications;

  const milestoneTotal = useMemo(
    () => milestones.reduce((sum, item) => sum + item.amount, 0),
    [milestones],
  );

const agreementPreview = useMemo(() => {
  const amountValue = Number(createForm.amount) || 0;
  const intro = `Buyer: ${createForm.role === "buyer" ? "You" : createForm.counterpartyName || "Buyer"}\nSeller: ${
    createForm.role === "seller" ? "You" : createForm.counterpartyName || "Seller"
  }\nAmount: ${formatCurrency(amountValue)}`;
  if (!milestones.length) {
    return intro;
  }
  const detail = milestones
    .map((milestone, index) => `${index + 1}. ${milestone.title} - ${formatCurrency(milestone.amount)}`)
    .join("\n");
  return `${intro}\n\nMilestones:\n${detail}`;
}, [createForm, milestones]);

const navActiveId = useMemo<ScreenId>(() => {
  if (["milestones", "agreement", "funding"].includes(activeScreen)) {
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
  if (typeof window === "undefined") {
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const screenParam = (params.get("screen") as ScreenId) || "welcome";
  const txParam = params.get("tx");
  const txId = txParam ? Number(txParam) : undefined;
  window.history.replaceState({ screen: screenParam, txId }, "", window.location.href);
}, []);

useEffect(() => {
  let ticking = false;
  const handleScroll = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      const currentY = window.scrollY || window.pageYOffset || 0;
      const last = lastScrollYRef.current;
      if (currentY > last + 10 && currentY > 120) {
        setToolbarHidden(true);
      } else if (currentY < last - 10 || currentY < 40) {
        setToolbarHidden(false);
      }
      lastScrollYRef.current = currentY;
      ticking = false;
    });
  };
  window.addEventListener("scroll", handleScroll, { passive: true });
  return () => window.removeEventListener("scroll", handleScroll);
}, []);

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

const updateTransactionStatus = (id: number, status: Transaction["status"], context: string) => {
  updateTransaction(id, (tx) => ({
    ...tx,
    status,
    context,
  }));
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
    setMilestones((prev) => [
      ...prev,
      { id: randomId(), title: milestoneInputs.title, amount: Number(milestoneInputs.amount) },
    ]);
    setMilestoneInputs({ title: "", amount: "" });
    setMessage(null);
  };

  const handleMilestonesNext = () => {
    const amountValue = Number(createForm.amount);
    if (milestones.length && amountValue && Math.abs(amountValue - milestoneTotal) > 0.01) {
      setMessage("Milestone total must match the escrow amount.");
      return;
    }
    setAgreementAccepted(false);
    resetSignaturePad();
    setMessage(null);
    navigate("agreement");
  };

  const handleAgreementNext = () => {
    if (!agreementAccepted || !signatureCaptured) {
      setMessage("Accept the agreement and confirm the signature to continue.");
      return;
    }
    setFundInput(createForm.amount);
    setMessage(null);
    navigate("funding");
  };

  const handleFundingComplete = async () => {
    const depositAmount = Number(fundInput);
    const escrowAmount = Number(createForm.amount);
    if (!depositAmount || depositAmount !== escrowAmount) {
      setMessage("Deposit must match the escrow amount exactly.");
      return;
    }
    if (depositAmount > walletBalance) {
      setMessage("Wallet balance is not sufficient.");
      return;
    }
    try {
      const response = await createEscrowMutation.mutateAsync({
        title: createForm.category ? `${createForm.category} escrow` : "New escrow",
        counterpart: createForm.counterpartyName || "Counterparty",
        amount: depositAmount,
        category: createForm.category,
      });
      const buyerInfo =
        createForm.role === "buyer"
          ? { name: currentUser.name, email: currentUser.email }
          : { name: createForm.counterpartyName || "Buyer", email: createForm.counterpartyEmail || "buyer@example.com" };
      const sellerInfo =
        createForm.role === "seller"
          ? { name: currentUser.name, email: currentUser.email }
          : { name: createForm.counterpartyName || "Seller", email: createForm.counterpartyEmail || "seller@example.com" };
      const newTx: Transaction = {
        id: response.escrowId ?? Math.floor(10000 + Math.random() * 90000),
        title: createForm.category ? `${createForm.category} escrow` : "New escrow",
        counterpart: createForm.role === "buyer" ? sellerInfo.name : buyerInfo.name,
        amount: depositAmount,
        status: "Active",
        context: "Milestones active",
        steps: [
          { title: "Agreement approved", detail: "Both sides signed", status: "complete" },
          { title: "Funded", detail: "Wallet balance secured", status: "complete" },
          { title: "Milestones active", detail: "Awaiting submission", status: "active" },
        ],
        buyer: buyerInfo.name,
        buyerEmail: buyerInfo.email,
        seller: sellerInfo.name,
        sellerEmail: sellerInfo.email,
        milestones: milestones.map((milestone) => ({
          id: milestone.id,
          title: milestone.title,
          amount: milestone.amount,
          status: "pending",
        })),
        timeline: [
          { id: randomId(), label: "Created", detail: "Escrow created", time: new Date().toISOString() },
          { id: randomId(), label: "Funded", detail: "Wallet balance secured", time: new Date().toISOString() },
        ],
      };
      setTransactions((prev) => [newTx, ...prev]);
      setWalletBalance((prev) => prev - depositAmount);
      recordWalletHistory("withdraw", depositAmount);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create escrow. Try again shortly.");
      return;
    }
    setCreateForm({
      role: "buyer",
      counterpartyName: "",
      counterpartyEmail: "",
      amount: "",
      category: "Goods",
    });
    setMilestones([]);
    setFundInput("");
    setAgreementAccepted(false);
    resetSignaturePad();
    setMessage("Escrow funded successfully.");
    navigate("dashboard");
  };

  const handleApprove = async (tx: Transaction) => {
    try {
      await approveEscrow.mutateAsync({ escrowId: String(tx.id) });
      updateTransactionStatus(tx.id, "Active", "Milestones active");
      setMessage(`Escrow ${tx.id} approved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to approve escrow.");
    }
  };

  const handleReject = async (tx: Transaction) => {
    try {
      await rejectEscrow.mutateAsync({ escrowId: String(tx.id) });
      updateTransactionStatus(tx.id, "Pending", "Rejected — waiting on changes");
      setMessage(`Escrow ${tx.id} rejected.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to reject escrow.");
    }
  };

  const handleCancel = async (tx: Transaction) => {
    try {
      await cancelEscrow.mutateAsync({ escrowId: String(tx.id) });
      updateTransactionStatus(tx.id, "Pending", "Cancelled");
      setMessage(`Escrow ${tx.id} cancelled.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to cancel escrow.");
    }
  };

  const handleMilestoneDecision = (txId: number, milestoneId: string, decision: "approve" | "reject") => {
    const updated = updateTransaction(txId, (tx) => {
      const timestamp = new Date().toISOString();
      let targetTitle = "";
      const updatedMilestones = tx.milestones.map((milestone) => {
        if (milestone.id !== milestoneId) {
          return milestone;
        }
        targetTitle = milestone.title;
        if (decision === "approve") {
          return { ...milestone, status: "released", releasedAt: timestamp, rejectedAt: undefined };
        }
        return { ...milestone, status: "rejected", rejectedAt: timestamp };
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
        <span style={{ fontWeight: 700, marginLeft: 6 }}>Scott</span>
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
                  {tx.status === "Active" ? (
                    <button
                      className="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleCancel(tx);
                      }}
                      disabled={cancelEscrow.isPending}
                    >
                      {cancelEscrow.isPending ? "Cancelling..." : "Cancel"}
                    </button>
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

  const renderCreate = () => (
    <section className="screen active">
      <h2 className="page-title">Create transaction</h2>
      <p className="lead">Set up an escrow between a buyer and seller.</p>
      <div className="card">
        <label className="muted">Your role</label>
        <div className="role-toggle">
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
                <span className="flow-info" tabIndex={0} aria-label={roleFlowCopy[role as "buyer" | "seller"].label}>
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

        <div className="form-field">
          <label className="muted">
            {createForm.role === "buyer" ? "Seller name" : "Buyer name"}
          </label>
          <input
            type="text"
            value={createForm.counterpartyName}
            placeholder="Counterparty name"
            onChange={(event) =>
              setCreateForm((prev) => ({ ...prev, counterpartyName: event.target.value }))
            }
          />
        </div>
        <div className="form-field">
          <label className="muted">
            {createForm.role === "buyer" ? "Seller email" : "Buyer email"}
          </label>
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
            placeholder="Amount"
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
        <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="ghost" onClick={() => navigate("welcome")}>
            Cancel
          </button>
          <button className="btn" onClick={handleCreateNext}>
            Next — Milestones
          </button>
        </div>
      </div>
    </section>
  );

  const renderMilestones = () => (
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
            Add milestone
          </button>
        </div>
        {milestones.length === 0 ? (
          <div className="muted" style={{ marginTop: 8 }}>
            No milestones yet
          </div>
        ) : (
          <>
            <div className="tx-list" style={{ marginTop: 8 }}>
              {milestones.map((milestone) => (
                <div key={milestone.id} className="tx-item">
                  <div>
                    <strong>{milestone.title}</strong>
                    <div className="muted">Milestone</div>
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
        <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="ghost" onClick={() => navigate("create")}>
            Back
          </button>
          <button className="btn" onClick={handleMilestonesNext}>
            Next — Terms
          </button>
        </div>
      </div>
    </section>
  );

  const renderAgreement = () => (
    <section className="screen active">
      <h2 className="page-title">Agreement & Signature</h2>
      <p className="lead">Review terms and sign to accept.</p>
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
          <button className="btn" onClick={handleAgreementNext}>
            Next -&gt; Funding
          </button>
        </div>
      </div>
    </section>
  );

  const renderFunding = () => (
    <section className="screen active">
      <h2 className="page-title">Funding</h2>
      <p className="lead">Deposit the escrow amount to lock the agreement.</p>
      <div className="card">
        <div className="muted">Amount</div>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
          {formatCurrency(Number(createForm.amount) || 0)}
        </div>
        <p className="muted">Wallet balance: {formatCurrency(walletBalance)}</p>
        <label className="muted" style={{ marginTop: 8 }}>
          Add to wallet
        </label>
        <input
          type="number"
          value={fundInput}
          placeholder="Amount to deposit"
          onChange={(event) => setFundInput(event.target.value)}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="ghost" onClick={() => navigate("agreement")}>
            Back
          </button>
          <button
            className="btn"
            onClick={handleFundingComplete}
            disabled={createEscrowMutation.isPending}
          >
            {createEscrowMutation.isPending ? "Funding..." : "Fund escrow"}
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
    <section className="screen active">
      <h2 className="page-title">Settings</h2>
      <p className="lead">Manage profile, security, and payout settings.</p>
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
    return (
      <section className="screen active">
        <h2 className="page-title">Transaction</h2>
        <div className="card">
          <div style={{ marginBottom: 12 }}>
            <div className="muted">Title</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{tx.title}</div>
          </div>
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
                    </div>
                    <div style={{ textAlign: "right", fontWeight: 700 }}>{formatCurrency(milestone.amount)}</div>
                  </div>
                  <div className="milestone-actions">
                    {milestone.status === "pending" ? (
                      <>
                        <button className="btn" onClick={() => handleMilestoneDecision(tx.id, milestone.id, "approve")}>
                          Approve
                        </button>
                        <button className="ghost" onClick={() => handleMilestoneDecision(tx.id, milestone.id, "reject")}>
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
              {tx.timeline.map((event) => (
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
      case "funding":
        return renderFunding();
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

  return (
    <AppShell>
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
      <footer className="toolbar" data-hidden={isToolbarHidden}>
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
      </footer>
      {notificationsPanelOpen ? (
        <div className="modal-overlay" onClick={closeNotificationsPanel}>
          <div className="modal-content notifications-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
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
              <>
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
                        <span className="notif-title-text">
                          {item.label}
                        </span>
                        <span className="notif-badge">Alert</span>
                      </div>
                      <div className="notif-detail">{item.detail}</div>
                      <div className="notif-meta">{item.meta}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
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
