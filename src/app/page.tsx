"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
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
  | "settings";

type Transaction = {
  id: number;
  title: string;
  counterpart: string;
  amount: number;
  status: "Pending" | "Active" | "Released" | "Cancelled";
  context: string;
  steps: Array<{ title: string; detail: string; status: "complete" | "active" | "upcoming" }>;
};

type Milestone = {
  id: string;
  title: string;
  amount: number;
};

const initialTransactions: Transaction[] = [
  {
    id: 1423,
    title: "Northwind agency launch",
    counterpart: "Northwind Agency",
    amount: 82000,
    status: "Pending",
    context: "Buyer needs to fund",
    steps: [
      { title: "Agreement approved", detail: "Both sides signed", status: "complete" },
      { title: "Funding pending", detail: "Buyer needs to deposit", status: "active" },
      { title: "Milestones active", detail: "Seller releases after delivery", status: "upcoming" },
    ],
  },
  {
    id: 9988,
    title: "Cloud Harbor retainer",
    counterpart: "Cloud Harbor",
    amount: 120500,
    status: "Active",
    context: "Milestone review next week",
    steps: [
      { title: "Agreement approved", detail: "Both sides signed", status: "complete" },
      { title: "Funded", detail: "Wallet balance secured", status: "complete" },
      { title: "Milestones active", detail: "4 / 6 completed", status: "active" },
    ],
  },
  {
    id: 7720,
    title: "Summit Legal retainer",
    counterpart: "Summit Legal",
    amount: 44300,
    status: "Released",
    context: "All milestones paid",
    steps: [
      { title: "Agreement approved", detail: "Both sides signed", status: "complete" },
      { title: "Funded", detail: "Wallet balance secured", status: "complete" },
      { title: "Released", detail: "Final payout sent", status: "complete" },
    ],
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

const randomId = () => Math.random().toString(36).slice(2, 9);

export default function Home() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>("welcome");
  const [walletBalance, setWalletBalance] = useState(1250.5);
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [createForm, setCreateForm] = useState({
    role: "buyer" as "buyer" | "seller",
    counterpartyName: "",
    counterpartyEmail: "",
    amount: "",
    category: "Goods",
  });
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [milestoneInputs, setMilestoneInputs] = useState({ title: "", amount: "" });
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [signatureConfirmed, setSignatureConfirmed] = useState(false);
  const [fundInput, setFundInput] = useState("");
  const [walletTopupAmount, setWalletTopupAmount] = useState("");
  const [walletWithdrawAmount, setWalletWithdrawAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
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

  const navigate = (screen: ScreenId) => {
    setActiveScreen(screen);
    setMessage(null);
  };

  const updateTransactionStatus = (id: number, status: Transaction["status"], context: string) => {
    setTransactions((prev) =>
      prev.map((tx) =>
        tx.id === id
          ? {
              ...tx,
              status,
              context,
            }
          : tx,
      ),
    );
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
    setSignatureConfirmed(false);
    setMessage(null);
    navigate("agreement");
  };

  const handleAgreementNext = () => {
    if (!agreementAccepted || !signatureConfirmed) {
      setMessage("Accept the agreement and confirm the signature to continue.");
      return;
    }
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
      const newTx: Transaction = {
        id: response.escrowId ?? Math.floor(10000 + Math.random() * 90000),
        title: createForm.category ? `${createForm.category} escrow` : "New escrow",
        counterpart: createForm.counterpartyName || "Counterparty",
        amount: depositAmount,
        status: "Active",
        context: "Milestones active",
        steps: [
          { title: "Agreement approved", detail: "Both sides signed", status: "complete" },
          { title: "Funded", detail: "Wallet balance secured", status: "complete" },
          { title: "Milestones active", detail: "Awaiting submission", status: "active" },
        ],
      };
      setTransactions((prev) => [newTx, ...prev]);
      setWalletBalance((prev) => prev - depositAmount);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create escrow. Try again shortly.",
      );
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
    setSignatureConfirmed(false);
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

  const handleWalletTopup = async () => {
    const amount = Number(walletTopupAmount);
    if (!amount || amount <= 0) {
      setMessage("Enter a valid top-up amount.");
      return;
    }
    try {
      const response = await walletTopup.mutateAsync({ amount });
      setWalletBalance(response.balance ?? walletBalance + amount);
      setWalletTopupAmount("");
      setMessage("Wallet topped up.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to top up wallet.");
    }
  };

  const handleWalletWithdraw = async () => {
    const amount = Number(walletWithdrawAmount);
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
      setWalletWithdrawAmount("");
      setMessage("Withdrawal requested.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to withdraw.");
    }
  };

  const renderWelcome = () => (
    <section className="screen active">
      <h2>
        Welcome back,
        <span style={{ fontWeight: 700, marginLeft: 6 }}>Scott</span>
      </h2>
      <p className="lead">The micro-escrow for everyday transactions.</p>
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
          <div className="t-title">Create</div>
          <div className="muted">New escrow</div>
          <button className="btn" onClick={() => navigate("create")}>
            Create
          </button>
        </div>
        <div className="tile">
          <div className="t-title">Recent</div>
          <div className="muted">Last activity</div>
          <div className="muted">
            {transactions.length ? `${transactions[0].title} • ${formatCurrency(transactions[0].amount)}` : "No activity"}
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
          <button className="ghost" onClick={() => setSupportOpen(true)}>
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
              <button className="ghost" onClick={() => navigate("dashboard")}>
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
              <div key={tx.id} className="tx-item">
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
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );

  const renderDashboard = () => (
    <section className="screen active">
      <h2>Dashboard</h2>
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
            <div key={tx.id} className="tx-item">
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
                        onClick={() => handleApprove(tx)}
                        disabled={approveEscrow.isPending}
                      >
                        {approveEscrow.isPending ? "Approving..." : "Approve"}
                      </button>
                      <button
                        className="ghost"
                        onClick={() => handleReject(tx)}
                        disabled={rejectEscrow.isPending}
                      >
                        {rejectEscrow.isPending ? "Rejecting..." : "Reject"}
                      </button>
                    </>
                  ) : null}
                  {tx.status === "Active" ? (
                    <button
                      className="ghost"
                      onClick={() => handleCancel(tx)}
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
        <h3 style={{ marginBottom: 8 }}>Milestone timeline</h3>
        <div className="timeline">
          <div className="timeline-row">
            <span className="timeline-dot timeline-dot--released" />
            <div>
              <strong>Funds released to Summit Legal</strong>
              <p className="muted" style={{ margin: "2px 0" }}>
                Yesterday • Final payout sent
              </p>
            </div>
          </div>
          <div className="timeline-row">
            <span className="timeline-dot timeline-dot--attention" />
            <div>
              <strong>Ops review for Cloud Harbor</strong>
              <p className="muted" style={{ margin: "2px 0" }}>
                Due tomorrow • Pending milestone approval
              </p>
            </div>
          </div>
          <div className="timeline-row">
            <span className="timeline-dot timeline-dot--funding" />
            <div>
              <strong>Buyer funding required</strong>
              <p className="muted" style={{ margin: "2px 0" }}>
                Northwind agency launch • Waiting for deposit
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginBottom: 8 }}>Notifications</h3>
        {notificationsQuery.isLoading ? (
          <div className="muted">Loading alerts...</div>
        ) : notificationsQuery.isError ? (
          <div className="muted">Unable to load notifications.</div>
        ) : notificationList.length === 0 ? (
          <div className="muted">No notifications right now.</div>
        ) : (
          <div className="notif-list">
            {notificationList.map((item) => (
              <div key={item.id} className="notif-item">
                <div className="notif-title">
                  {item.label}
                  <span className="notif-badge">Alert</span>
                </div>
                <div className="notif-detail">{item.detail}</div>
                <div className="notif-meta">{item.meta}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );

  const renderCreate = () => (
    <section className="screen active">
      <h2>Create transaction</h2>
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
              <span>{role === "buyer" ? "I'm the buyer" : "I'm the seller"}</span>
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
      <h2>Milestones</h2>
      <p className="lead">Break the agreement into deliverables before moving on to the terms.</p>
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginBottom: 8 }}>How funds are released</h3>
        <div className="flow-grid">
          <div className="flow-block">
            <div className="flow-pill">Milestone release</div>
            <ol className="flow-steps">
              <li>Seller submits a milestone for buyer review.</li>
              <li>Buyer logs in to see a milestone alert.</li>
              <li>Buyer approves and funds release instantly.</li>
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
      <h2>Agreement & Signature</h2>
      <p className="lead">Review terms and sign to accept.</p>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="form-field">
          <label className="muted">Agreement preview</label>
          <textarea value={agreementPreview} rows={8} readOnly />
        </div>
        <div className="sig-wrap">
          <div className="muted" style={{ marginBottom: 6 }}>
            Signature
          </div>
          <div className="signature-pad" onClick={() => setSignatureConfirmed(true)}>
            {signatureConfirmed ? "Signature captured" : "Tap to confirm signature"}
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
            Next — Funding
          </button>
        </div>
      </div>
    </section>
  );

  const renderFunding = () => (
    <section className="screen active">
      <h2>Funding</h2>
      <p className="lead">Deposit the escrow amount to lock the agreement.</p>
      <div className="card">
        <p className="muted">Wallet balance: {formatCurrency(walletBalance)}</p>
        <div className="form-field">
          <label className="muted">Amount to deposit</label>
          <input
            type="number"
            value={fundInput}
            placeholder={createForm.amount || "0"}
            onChange={(event) => setFundInput(event.target.value)}
          />
        </div>
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
      <h2>Wallet</h2>
      <p className="lead">Track deposits and withdrawals.</p>
      <div className="card">
        <div className="tiles">
          <div className="tile">
            <div className="t-title">Available</div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{formatCurrency(walletBalance)}</div>
          </div>
          <div className="tile">
            <div className="t-title">Pending holds</div>
            <div className="muted">{formatCurrency(92000)}</div>
          </div>
        </div>
        <div className="form-field" style={{ marginTop: 12 }}>
          <label className="muted">Top up</label>
          <input
            type="number"
            value={walletTopupAmount}
            placeholder="Amount"
            onChange={(event) => setWalletTopupAmount(event.target.value)}
          />
        </div>
        <div className="form-field">
          <label className="muted">Withdraw</label>
          <input
            type="number"
            value={walletWithdrawAmount}
            placeholder="Amount"
            onChange={(event) => setWalletWithdrawAmount(event.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={handleWalletTopup} disabled={walletTopup.isPending}>
            {walletTopup.isPending ? "Processing..." : "Deposit"}
          </button>
          <button className="ghost" onClick={handleWalletWithdraw} disabled={walletWithdraw.isPending}>
            {walletWithdraw.isPending ? "Processing..." : "Withdraw"}
          </button>
        </div>
      </div>
    </section>
  );

  const renderHistory = () => (
    <section className="screen active">
      <h2>History</h2>
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
      <h2>Settings</h2>
      <p className="lead">Manage notifications and automation.</p>
      <div className="card">
        <div className="form-field">
          <label className="muted">Notifications</label>
          <select defaultValue="all">
            <option value="all">All updates</option>
            <option value="important">Important only</option>
          </select>
        </div>
        <div className="form-field">
          <label className="muted">Auto-release safeguards</label>
          <select defaultValue="manual">
            <option value="manual">Manual review</option>
            <option value="auto">Auto release after approval</option>
          </select>
        </div>
      </div>
    </section>
  );

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
        <nav className="bottom-nav">
          {bottomNav.map((item) => (
            <button
              key={item.id}
              className={activeScreen === item.id ? "active" : ""}
              onClick={() => navigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </footer>
      {supportOpen ? (
        <div className="modal-overlay" onClick={() => setSupportOpen(false)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <h3>Support</h3>
            <p className="muted">For demo assistance, email support@myescrow.com.</p>
            <div style={{ textAlign: "right", marginTop: 12 }}>
              <button className="ghost" onClick={() => setSupportOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
