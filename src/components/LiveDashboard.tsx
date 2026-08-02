"use client";

import {
  FormEvent,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { NotificationTimestamp } from "@/components/NotificationTimestamp";
import { EscrowChat } from "@/components/EscrowChat";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";
import {
  useCreateEscrow,
  useDeleteEscrowCreationDraft,
  useDisputes,
  useEscrowCreationDraft,
  useEscrowSummary,
  useEscrows,
  useNotifications,
  useSaveEscrowCreationDraft,
} from "@/hooks/useDashboardData";
import { orderNotifications } from "@/lib/notificationOrdering";
import { normalizeCurrencyInput } from "@/lib/currencyInput";
import {
  latestNotificationSeenToken,
  useNotificationSeenToken,
} from "@/lib/notificationSeen";
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

type EscrowFormState = {
  title: string;
  counterpartyEmail: string;
  creatorRole: "buyer" | "seller";
  amount: string;
  description: string;
  fundingMode: "full" | "milestone" | "";
};

const emptyEscrowForm = (): EscrowFormState => ({
  title: "",
  counterpartyEmail: "",
  creatorRole: "buyer",
  amount: "",
  description: "",
  fundingMode: "",
});

const creationDraftFingerprint = (draft: EscrowCreationDraftData) =>
  JSON.stringify(parseEscrowCreationDraftData(draft));

export function LiveDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, isHydrating, logout } = useAuth();
  const { pushToast } = useToast();

  const overviewQuery = useEscrowSummary();
  const escrowsQuery = useEscrows();
  const disputesQuery = useDisputes();
  const notificationsQuery = useNotifications();
  const createEscrow = useCreateEscrow();
  const creationDraftQuery = useEscrowCreationDraft(
    Boolean(user && isAuthenticated && !isHydrating),
  );
  const saveCreationDraft = useSaveEscrowCreationDraft();
  const deleteCreationDraft = useDeleteEscrowCreationDraft();
  const saveCreationDraftRequest = saveCreationDraft.mutateAsync;

  const createFormRef = useRef<HTMLDivElement | null>(null);
  const [escrowForm, setEscrowForm] = useState<EscrowFormState>(emptyEscrowForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [chatEscrowId, setChatEscrowId] = useState<string | null>(null);
  const [draftHydratedUserId, setDraftHydratedUserId] = useState<string | null>(null);
  const [draftSaveStatus, setDraftSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [creationSubmitting, setCreationSubmitting] = useState(false);
  const [conflictingLocalDraft, setConflictingLocalDraft] = useState<StoredEscrowCreationDraft | null>(null);
  const [draftBase, setDraftBase] = useState<EscrowCreationDraftData | null>(null);
  const draftTimeoutRef = useRef<number | null>(null);
  const draftQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const draftSubmittingRef = useRef(false);
  const draftRevisionRef = useRef(0);
  const hasCreationDraftRef = useRef(false);
  const draftServerRevisionRef = useRef(0);
  const draftHydrationBaselineRef = useRef<string | null>(null);
  const draftReconciledServerTokenRef = useRef<string | null>(null);
  const draftSnapshotRef = useRef<EscrowCreationDraftData | null>(null);

  const notificationCount = notificationsQuery.data?.notifications.length ?? 0;
  const displayName = user?.name?.trim() || user?.email || "Your account";
  const notificationUserId = user?.id ?? user?.email ?? "anonymous";
  const { seenNotificationToken, saveNotificationSeenToken } =
    useNotificationSeenToken(notificationUserId);

  const summaryMetrics = overviewQuery.data?.summaryMetrics ?? [];
  const disputes = disputesQuery.data?.disputes ?? [];
  const notifications = orderNotifications(notificationsQuery.data?.notifications ?? []);
  const latestAlertToken = latestNotificationSeenToken(notifications);
  const hasUnreadNotifications = Boolean(latestAlertToken && seenNotificationToken !== latestAlertToken);
  const escrows = escrowsQuery.data?.escrows ?? [];
  const fundingPlanSelectionSupported =
    escrowsQuery.data?.fundingPlanSelectionSupported === true;

  const totalHeld = summaryMetrics.find((metric) => metric.id === "held")?.value ?? "$0";

  const creationDraftSnapshot = useMemo<EscrowCreationDraftData>(() => ({
    schemaVersion: ESCROW_CREATION_DRAFT_SCHEMA_VERSION,
    screen: "create",
    createPromptStep: draftBase?.createPromptStep ?? 0,
    descriptionSkipped: draftBase?.descriptionSkipped ?? false,
    createForm: {
      role: escrowForm.creatorRole,
      counterpartyEmail: escrowForm.counterpartyEmail,
      counterpartyEmailConfirmation: escrowForm.counterpartyEmail,
      title: escrowForm.title,
      amount: escrowForm.amount,
      category: draftBase?.createForm.category ?? "Goods",
      description: escrowForm.description,
      fundingMode: escrowForm.fundingMode || null,
      partyType: draftBase?.createForm.partyType ?? "individual",
      business: draftBase?.createForm.business ?? {
        legalName: "",
        representativeTitle: "",
      },
    },
    milestones: draftBase?.milestones ?? [],
    milestoneInputs: draftBase?.milestoneInputs ?? {
      title: "",
      amount: "",
      description: "",
      deadline: "",
    },
    editingMilestoneId: draftBase?.editingMilestoneId ?? null,
  }), [draftBase, escrowForm]);

  const queueDraftSave = useCallback((snapshot: EscrowCreationDraftData, revision: number) => {
    const operation = draftQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (draftSubmittingRef.current) return null;
        try {
          const savedState = await saveCreationDraftRequest({
            baseRevision: draftServerRevisionRef.current,
            draft: snapshot,
          });
          const saved = savedState.draft;
          if (!saved) throw new Error("The agreement draft save response was invalid.");
          draftServerRevisionRef.current = savedState.revision;
          if (user?.id) {
            if (draftRevisionRef.current === revision) {
              writeEscrowCreationDraftCache(user.id, saved);
              setDraftSaveStatus("saved");
            } else if (draftSnapshotRef.current) {
              const rebasedDraft = createStoredEscrowCreationDraft(
                draftSnapshotRef.current,
                saved,
                undefined,
                savedState.revision,
                true,
              );
              if (rebasedDraft) writeEscrowCreationDraftCache(user.id, rebasedDraft);
            }
          }
          return saved;
        } catch (error) {
          if (draftRevisionRef.current === revision) setDraftSaveStatus("error");
          throw error;
        }
      });
    draftQueueRef.current = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }, [saveCreationDraftRequest, user]);

  useEffect(() => {
    draftSnapshotRef.current = creationDraftSnapshot;
  }, [creationDraftSnapshot]);

  const restoreDraft = useCallback((draft: StoredEscrowCreationDraft) => {
    draftHydrationBaselineRef.current = creationDraftFingerprint(draft);
    startTransition(() => {
      setDraftBase(draft);
      setEscrowForm({
        title: draft.createForm.title,
        counterpartyEmail: draft.createForm.counterpartyEmail,
        creatorRole: draft.createForm.role,
        amount: draft.createForm.amount,
        description: draft.createForm.description,
        fundingMode: draft.createForm.fundingMode ?? "",
      });
    });
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    if (creationDraftQuery.isError) {
      if (draftHydratedUserId !== user.id) {
        const localDraft = readEscrowCreationDraftCache(user.id);
        if (localDraft) {
          hasCreationDraftRef.current = true;
          draftServerRevisionRef.current = localDraft.serverRevision;
          restoreDraft(localDraft);
        } else {
          hasCreationDraftRef.current = false;
        }
        startTransition(() => {
          setDraftSaveStatus("error");
          setConflictingLocalDraft(readEscrowCreationDraftConflictCache(user.id));
          setDraftHydratedUserId(user.id);
        });
      }
      return;
    }

    const serverState = creationDraftQuery.data;
    if (!serverState) return;
    if (serverState.revision < draftServerRevisionRef.current) {
      if (draftHydratedUserId !== user.id) {
        startTransition(() => setDraftHydratedUserId(user.id));
      }
      return;
    }
    const serverToken = `${user.id}:${serverState.revision}:${serverState.draft?.updatedAt ?? "deleted"}`;
    if (draftReconciledServerTokenRef.current === serverToken) {
      if (draftHydratedUserId !== user.id) {
        startTransition(() => setDraftHydratedUserId(user.id));
      }
      return;
    }

    const localDraft = readEscrowCreationDraftCache(user.id);
    const serverDraft = serverState.draft;
    let restoredDraft: StoredEscrowCreationDraft | null = serverDraft;
    let shouldSyncLocalDraft = false;
    let nextConflictingLocalDraft = serverDraft
      ? readEscrowCreationDraftConflictCache(user.id)
      : null;
    if (localDraft) {
      if (localDraft.serverRevision === serverState.revision) {
        if (!serverDraft || localDraft.hasLocalChanges) {
          restoredDraft = localDraft;
          shouldSyncLocalDraft = localDraft.hasLocalChanges;
        }
      } else if (!serverDraft) {
        restoredDraft = null;
      } else if (localDraft.hasLocalChanges) {
        nextConflictingLocalDraft = localDraft;
        writeEscrowCreationDraftConflictCache(user.id, localDraft);
      }
    }

    if (!serverDraft) clearEscrowCreationDraftConflictCache(user.id);

    draftServerRevisionRef.current = serverState.revision;
    draftReconciledServerTokenRef.current = serverToken;
    startTransition(() => setConflictingLocalDraft(nextConflictingLocalDraft));
    if (restoredDraft) {
      hasCreationDraftRef.current = true;
      writeEscrowCreationDraftCache(user.id, restoredDraft);
      restoreDraft(restoredDraft);
      startTransition(() => setDraftSaveStatus(shouldSyncLocalDraft ? "saving" : "saved"));
      if (shouldSyncLocalDraft) {
        const revision = draftRevisionRef.current + 1;
        draftRevisionRef.current = revision;
        void queueDraftSave(restoredDraft, revision).catch(() => undefined);
      }
    } else {
      hasCreationDraftRef.current = false;
      clearEscrowCreationDraftCache(user.id);
      draftHydrationBaselineRef.current = null;
      startTransition(() => {
        setDraftBase(null);
        setEscrowForm(emptyEscrowForm());
        setDraftSaveStatus("idle");
      });
    }
    startTransition(() => setDraftHydratedUserId(user.id));
  }, [
    creationDraftQuery.data,
    creationDraftQuery.isError,
    draftHydratedUserId,
    queueDraftSave,
    restoreDraft,
    user?.id,
  ]);

  useEffect(() => {
    if (
      !user?.id
      || draftHydratedUserId !== user.id
      || draftSubmittingRef.current
      || conflictingLocalDraft
      || (
        !hasCreationDraftRef.current
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
    const cached = writeEscrowCreationDraftCache(
      user.id,
      creationDraftSnapshot,
      undefined,
      draftServerRevisionRef.current,
    );
    if (cached) hasCreationDraftRef.current = true;
    const revision = draftRevisionRef.current + 1;
    draftRevisionRef.current = revision;
    startTransition(() => setDraftSaveStatus(cached ? "saving" : "error"));
    if (draftTimeoutRef.current) window.clearTimeout(draftTimeoutRef.current);
    draftTimeoutRef.current = window.setTimeout(() => {
      draftTimeoutRef.current = null;
      void queueDraftSave(creationDraftSnapshot, revision).catch(() => undefined);
    }, 700);
    return () => {
      if (draftTimeoutRef.current) {
        window.clearTimeout(draftTimeoutRef.current);
        draftTimeoutRef.current = null;
      }
    };
  }, [
    conflictingLocalDraft,
    creationDraftSnapshot,
    draftHydratedUserId,
    queueDraftSave,
    user?.id,
  ]);

  useEffect(() => {
    if (!user?.id) return;
    const preserveDraft = () => {
      if (
        !draftSubmittingRef.current
        && !conflictingLocalDraft
        && (
          hasCreationDraftRef.current
          || hasMeaningfulEscrowCreationDraft(creationDraftSnapshot)
        )
      ) {
        writeEscrowCreationDraftCache(
          user.id,
          creationDraftSnapshot,
          undefined,
          draftServerRevisionRef.current,
        );
      }
    };
    window.addEventListener("pagehide", preserveDraft);
    return () => window.removeEventListener("pagehide", preserveDraft);
  }, [conflictingLocalDraft, creationDraftSnapshot, user?.id]);

  const handleSaveDraft = async () => {
    if (!user?.id) return;
    if (conflictingLocalDraft) {
      pushToast({ variant: "error", title: "Choose which draft copy to use before saving." });
      return;
    }
    if (draftTimeoutRef.current) {
      window.clearTimeout(draftTimeoutRef.current);
      draftTimeoutRef.current = null;
    }
    const cached = writeEscrowCreationDraftCache(
      user.id,
      creationDraftSnapshot,
      undefined,
      draftServerRevisionRef.current,
    );
    if (cached) hasCreationDraftRef.current = true;
    const revision = draftRevisionRef.current + 1;
    draftRevisionRef.current = revision;
    setDraftSaveStatus(cached ? "saving" : "error");
    try {
      await queueDraftSave(creationDraftSnapshot, revision);
      pushToast({ variant: "success", title: "Draft saved." });
    } catch {
      pushToast({
        variant: cached ? "info" : "error",
        title: cached
          ? "Draft saved on this device. Account sync will retry."
          : "Unable to save this draft.",
      });
    }
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
    restoreDraft(rebasedDraft);
    writeEscrowCreationDraftCache(user.id, rebasedDraft);
    setDraftSaveStatus("saving");
    const revision = draftRevisionRef.current + 1;
    draftRevisionRef.current = revision;
    void queueDraftSave(rebasedDraft, revision)
      .then(() => {
        clearEscrowCreationDraftConflictCache(user.id);
        setConflictingLocalDraft(null);
      })
      .catch(() => setConflictingLocalDraft(conflictingLocalDraft));
  };

  const useLoadedServerDraft = () => {
    if (!user?.id) return;
    clearEscrowCreationDraftConflictCache(user.id);
    setConflictingLocalDraft(null);
    setDraftSaveStatus("saved");
  };

  const handleDiscardDraft = async () => {
    if (!user?.id) return;
    draftSubmittingRef.current = true;
    if (draftTimeoutRef.current) {
      window.clearTimeout(draftTimeoutRef.current);
      draftTimeoutRef.current = null;
    }
    await draftQueueRef.current.catch(() => undefined);
    try {
      const state = await deleteCreationDraft.mutateAsync(draftServerRevisionRef.current);
      draftServerRevisionRef.current = state.revision;
      clearEscrowCreationDraftCache(user.id);
      clearEscrowCreationDraftConflictCache(user.id);
      draftHydrationBaselineRef.current = null;
      setEscrowForm(emptyEscrowForm());
      setDraftBase(null);
      hasCreationDraftRef.current = false;
      setConflictingLocalDraft(null);
      setDraftSaveStatus("idle");
      pushToast({ variant: "info", title: "Draft discarded." });
    } catch (error) {
      pushToast({
        variant: "error",
        title: error instanceof Error ? error.message : "Unable to discard this draft.",
      });
    } finally {
      draftSubmittingRef.current = false;
    }
  };

  const scrollToForm = () => {
    createFormRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const markAlertsSeen = () => {
    if (!latestAlertToken) return;
    saveNotificationSeenToken(latestAlertToken);
  };

  const handleEscrowSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draftSubmittingRef.current || createEscrow.isPending) return;
    if (conflictingLocalDraft) {
      setFormError("Resolve the draft conflict before creating the escrow.");
      return;
    }
    setFormError(null);
    const amountValue = Number(escrowForm.amount);
    if (
      !escrowForm.title ||
      !escrowForm.counterpartyEmail ||
      Number.isNaN(amountValue) ||
      amountValue <= 0 ||
      !escrowForm.fundingMode ||
      !fundingPlanSelectionSupported
    ) {
      setFormError(
        fundingPlanSelectionSupported
          ? "Add a title, counterparty email, positive amount, and funding plan."
          : "Funding-plan selection is waiting for the backend deployment to finish.",
      );
      return;
    }
    draftSubmittingRef.current = true;
    setCreationSubmitting(true);
    if (draftTimeoutRef.current) {
      window.clearTimeout(draftTimeoutRef.current);
      draftTimeoutRef.current = null;
    }
    await draftQueueRef.current.catch(() => undefined);
    try {
      const response = await createEscrow.mutateAsync({
        title: escrowForm.title,
        counterpartyEmail: escrowForm.counterpartyEmail,
        amount: amountValue,
        fundingMode: escrowForm.fundingMode,
        creatorRole: escrowForm.creatorRole,
        creatorParty: { type: "individual" },
        description: escrowForm.description || undefined,
        draftRevision: draftServerRevisionRef.current,
      });
      draftServerRevisionRef.current += 1;
      const inviteMessage =
        response.invitationStatus === "signup_required"
          ? "Invitation sent. The counterparty must create and verify an account before review."
          : response.invitationStatus === "verification_required"
            ? "Invitation sent. The counterparty must verify their existing account before review."
            : "Escrow created in staging.";
      if (user?.id) {
        clearEscrowCreationDraftCache(user.id);
        clearEscrowCreationDraftConflictCache(user.id);
      }
      setEscrowForm(emptyEscrowForm());
      setDraftBase(null);
      hasCreationDraftRef.current = false;
      setConflictingLocalDraft(null);
      setDraftSaveStatus("idle");
      draftSubmittingRef.current = false;
      setCreationSubmitting(false);
      pushToast({ variant: "success", title: inviteMessage });
    } catch (error) {
      draftSubmittingRef.current = false;
      setCreationSubmitting(false);
      const message = error instanceof Error ? error.message : "Unable to create escrow.";
      setFormError(message);
      pushToast({ variant: "error", title: message });
    }
  };

  if (isHydrating) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <p className="auth-eyebrow">Loading account…</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    router.replace("/login");
    return null;
  }

  return (
    <AppShell screenId="live">
      <Header
        notificationCount={notificationCount}
        hasUnreadNotifications={hasUnreadNotifications}
        primaryLabel={draftBase ? "Resume draft" : "New escrow"}
        primaryDisabled={creationSubmitting || createEscrow.isPending}
        onPrimaryClick={scrollToForm}
        onLogoutClick={logout}
        onSettingsClick={scrollToForm}
        onAlertsClick={() => {
          markAlertsSeen();
          const notificationsSection = document.getElementById("live-notifications");
          notificationsSection?.scrollIntoView({ behavior: "smooth" });
        }}
      />
      <main className="app-main live-dashboard">
        <section className="card live-summary-card">
          <div>
            <p className="muted" style={{ margin: 0 }}>
              Signed in as
            </p>
            <h2 style={{ margin: "4px 0 0" }}>{displayName}</h2>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Total held in escrow: {totalHeld}
            </p>
          </div>
          <button className="ghost" onClick={logout}>
            Log out
          </button>
        </section>

        <section className="dashboard-section">
          <div className="section-heading">
            <h3>Account metrics</h3>
            {overviewQuery.isLoading ? <span className="muted">Loading…</span> : null}
          </div>
          {summaryMetrics.length === 0 ? (
            <div className="card muted">No escrows yet. Create one to see live metrics.</div>
          ) : (
            <div className="summary-grid">
              {summaryMetrics.map((metric) => (
                <div key={metric.id} className="card summary-card">
                  <p className="muted" style={{ margin: 0 }}>
                    {metric.label}
                  </p>
                  <strong style={{ fontSize: 20 }}>{metric.value}</strong>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {metric.meta}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-grid">
          <div className="card list-card">
            <div className="section-heading">
              <h3>Active escrows</h3>
              {escrowsQuery.isLoading ? <span className="muted">Loading…</span> : null}
            </div>
            {escrows.length === 0 ? (
              <p className="muted">No escrows found for this account yet.</p>
            ) : (
              <ul className="list">
                {escrows.map((escrow) => (
                  <li key={escrow.id} className="list-item">
                    <div>
                      <strong>{escrow.counterpart}</strong>
                      <div className="muted">{escrow.stage}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div>{escrow.amount}</div>
                      <div className="muted">{escrow.due}</div>
                      <button
                        className="ghost"
                        type="button"
                        style={{ marginTop: 8 }}
                        onClick={() => setChatEscrowId((current) => current === escrow.id ? null : escrow.id)}
                      >
                        {chatEscrowId === escrow.id ? "Close chat" : "Open chat"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {chatEscrowId ? (
              <div style={{ marginTop: 16 }}>
                <EscrowChat
                  escrowId={chatEscrowId}
                  counterpart={escrows.find((escrow) => escrow.id === chatEscrowId)?.counterpart ?? "counterparty"}
                />
              </div>
            ) : null}
          </div>

          <div className="card list-card" id="live-notifications">
            <div className="section-heading">
              <h3>Notifications</h3>
              {notificationsQuery.isLoading ? <span className="muted">Loading…</span> : null}
            </div>
            {notifications.length === 0 ? (
              <p className="muted">No notifications yet.</p>
            ) : (
              <ul className="list">
                {notifications.map((notification) => (
                  <li key={notification.id} className="list-item">
                    <div>
                      <strong>{notification.label}</strong>
                      <div className="muted">{notification.detail}</div>
                    </div>
                    <div className="muted">
                      {notification.createdAt ? (
                        <NotificationTimestamp createdAt={notification.createdAt} />
                      ) : (
                        notification.meta
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="dashboard-grid">
          <div className="card list-card">
            <div className="section-heading">
              <h3>Disputes</h3>
              {disputesQuery.isLoading ? <span className="muted">Loading…</span> : null}
            </div>
            {disputes.length === 0 ? (
              <p className="muted">No open disputes for this account.</p>
            ) : (
              <ul className="list">
                {disputes.map((dispute) => (
                  <li key={dispute.id} className="list-item">
                    <div>
                      <strong>{dispute.title}</strong>
                      <div className="muted">{dispute.owner}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div>{dispute.amount}</div>
                      <div className="muted">{dispute.updated}</div>
                      {dispute.status === "arbitration_requested" ? (
                        <button
                          type="button"
                          className="ghost"
                          style={{ marginTop: 8 }}
                          onClick={() => router.push(
                            `/disputes/${encodeURIComponent(dispute.id)}/arbitration-report`,
                          )}
                        >
                          Arbitration report
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card create-card" ref={createFormRef}>
            <div className="section-heading">
              <h3>Create escrow</h3>
              {creationSubmitting || createEscrow.isPending ? <span className="muted">Submitting…</span> : null}
            </div>
            {draftHydratedUserId !== user?.id ? (
              <div className="muted" role="status">Restoring your saved draft…</div>
            ) : null}
            {conflictingLocalDraft ? (
              <div className="auth-error" role="alert">
                <div>A newer draft was saved elsewhere. That version is loaded.</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  <button type="button" className="ghost" onClick={useLoadedServerDraft}>
                    Continue with loaded copy
                  </button>
                  <button type="button" className="ghost" onClick={useConflictingDeviceDraft}>
                    Use this device&apos;s copy
                  </button>
                </div>
              </div>
            ) : null}
            <form className="create-form" onSubmit={handleEscrowSubmit}>
              <label className="muted" htmlFor="escrow-title">
                Title
              </label>
              <input
                id="escrow-title"
                type="text"
                disabled={draftHydratedUserId !== user?.id || Boolean(conflictingLocalDraft) || creationSubmitting}
                value={escrowForm.title}
                maxLength={200}
                onChange={(event) => setEscrowForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Project name"
              />
              <label className="muted" htmlFor="escrow-counterparty-email">
                Counterparty email
              </label>
              <input
                id="escrow-counterparty-email"
                type="email"
                disabled={draftHydratedUserId !== user?.id || Boolean(conflictingLocalDraft) || creationSubmitting}
                value={escrowForm.counterpartyEmail}
                maxLength={320}
                onChange={(event) =>
                  setEscrowForm((prev) => ({ ...prev, counterpartyEmail: event.target.value }))
                }
                placeholder="counterparty@example.com"
              />
              <label className="muted" htmlFor="escrow-creator-role">
                I am the
              </label>
              <select
                id="escrow-creator-role"
                disabled={draftHydratedUserId !== user?.id || Boolean(conflictingLocalDraft) || creationSubmitting}
                value={escrowForm.creatorRole}
                onChange={(event) =>
                  setEscrowForm((prev) => ({
                    ...prev,
                    creatorRole: event.target.value === "seller" ? "seller" : "buyer",
                  }))
                }
              >
                <option value="buyer">Buyer</option>
                <option value="seller">Seller</option>
              </select>
              <label className="muted" htmlFor="escrow-amount">
                Amount (USD)
              </label>
              <input
                id="escrow-amount"
                type="text"
                inputMode="decimal"
                maxLength={32}
                disabled={draftHydratedUserId !== user?.id || Boolean(conflictingLocalDraft) || creationSubmitting}
                value={escrowForm.amount}
                onChange={(event) => setEscrowForm((prev) => ({
                  ...prev,
                  amount: normalizeCurrencyInput(event.target.value),
                }))}
                placeholder="25000"
              />
              <label className="muted" htmlFor="escrow-funding-mode">
                Funding plan
              </label>
              <select
                id="escrow-funding-mode"
                value={escrowForm.fundingMode}
                required
                disabled={
                  !fundingPlanSelectionSupported
                  || draftHydratedUserId !== user?.id
                  || Boolean(conflictingLocalDraft)
                  || creationSubmitting
                }
                onChange={(event) =>
                  setEscrowForm((prev) => ({
                    ...prev,
                    fundingMode:
                      event.target.value === "milestone"
                        ? "milestone"
                        : event.target.value === "full"
                          ? "full"
                          : "",
                  }))
                }
              >
                <option value="">Choose a funding plan</option>
                <option value="full">Fund the entire escrow</option>
                <option value="milestone">Flexible staged funding</option>
              </select>
              <p className="muted" style={{ margin: 0 }}>
                {fundingPlanSelectionSupported
                  ? "This funding method becomes part of the agreement."
                  : escrowsQuery.isLoading
                    ? "Checking backend support..."
                    : "Backend update pending."}
              </p>
              <label className="muted" htmlFor="escrow-description">
                Description (optional)
              </label>
              <textarea
                id="escrow-description"
                disabled={draftHydratedUserId !== user?.id || Boolean(conflictingLocalDraft) || creationSubmitting}
                value={escrowForm.description}
                maxLength={10_000}
                onChange={(event) =>
                  setEscrowForm((prev) => ({ ...prev, description: event.target.value }))
                }
                rows={3}
                placeholder="Outline the deliverables or milestones."
              />
              {formError ? (
                <div className="auth-error" role="alert">
                  {formError}
                </div>
              ) : null}
              <div className="muted" role="status" aria-live="polite">
                {draftSaveStatus === "saving"
                  ? "Saving draft…"
                  : draftSaveStatus === "saved"
                    ? "Draft saved"
                    : draftSaveStatus === "error"
                      ? "Saved on this device; account sync will retry"
                      : "Drafts save automatically as you type"}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  className="ghost"
                  type="button"
                  disabled={
                    saveCreationDraft.isPending
                    || draftHydratedUserId !== user?.id
                    || Boolean(conflictingLocalDraft)
                  }
                  onClick={() => void handleSaveDraft()}
                >
                  Save draft
                </button>
                {(draftBase || hasMeaningfulEscrowCreationDraft(creationDraftSnapshot) || conflictingLocalDraft) ? (
                  <button
                    className="ghost"
                    type="button"
                    disabled={deleteCreationDraft.isPending || draftHydratedUserId !== user?.id}
                    onClick={() => void handleDiscardDraft()}
                  >
                    Discard
                  </button>
                ) : null}
                <button
                  className="btn"
                  type="submit"
                  disabled={
                    creationSubmitting
                    || createEscrow.isPending
                    || draftHydratedUserId !== user?.id
                    || Boolean(conflictingLocalDraft)
                  }
                >
                  {creationSubmitting || createEscrow.isPending ? "Creating…" : "Create escrow"}
                </button>
              </div>
            </form>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
