"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DisputeTicket,
  EscrowRecord,
  SummaryMetric,
  TimelineEvent,
} from "@/lib/mockDashboard";
import { apiFetch } from "@/lib/apiClient";

const parseErrorMessage = async (response: Response) => {
  const raw = await response.text();
  if (!raw) {
    return `Request failed: ${response.status}`;
  }
  try {
    const parsed = JSON.parse(raw) as {
      error?: string;
      message?: string;
      issues?: Array<{ message?: string }>;
    };
    if (parsed.message) return parsed.message;
    if (parsed.error) return parsed.error;
    if (parsed.issues?.length) {
      return parsed.issues.map((issue) => issue.message).filter(Boolean).join(" ");
    }
  } catch {
    // Fall back to the raw body if it is not JSON.
  }
  return raw;
};

const fetchJSON = async <T>(input: string, init?: RequestInit): Promise<T> => {
  const response = await apiFetch(input, init);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
  return (await response.json()) as T;
};

const idempotencyHeaders = (headers?: HeadersInit) => ({
  ...Object.fromEntries(new Headers(headers).entries()),
  "Idempotency-Key": crypto.randomUUID(),
});

type OverviewResponse = {
  walletBalance?: string;
  summaryMetrics: SummaryMetric[];
  activeEscrows: EscrowRecord[];
  timelineEvents: TimelineEvent[];
};

type EscrowResponse = {
  escrows: EscrowRecord[];
};

type DisputesResponse = {
  disputes: DisputeTicket[];
};

type NotificationsResponse = {
  notifications: Array<{
    id: string;
    label: string;
    detail: string;
    meta: string;
    createdAt?: string;
    txId?: number;
  }>;
};

export type WalletTransaction = {
  id: string;
  amount: string;
  type: string;
  direction: "credit" | "debit";
  createdAt: string;
};

type WalletTransactionsResponse = {
  transactions: WalletTransaction[];
};

type DraftEscrowUpdatePayload = {
  escrowId: string;
  title: string;
  counterpartyEmail: string;
  amount: number;
  description?: string;
  milestones?: Array<{
    title: string;
    amount: number;
    description?: string;
    deadline?: string;
  }>;
};

export function useEscrowSummary() {
  return useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => fetchJSON<OverviewResponse>("/api/dashboard/overview"),
    retry: 2,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
}

export function useEscrows() {
  return useQuery({
    queryKey: ["dashboard", "escrows"],
    queryFn: () => fetchJSON<EscrowResponse>("/api/dashboard/escrows"),
  });
}

export function useDisputes() {
  return useQuery({
    queryKey: ["dashboard", "disputes"],
    queryFn: () => fetchJSON<DisputesResponse>("/api/dashboard/disputes"),
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ["dashboard", "notifications"],
    queryFn: () => fetchJSON<NotificationsResponse>("/api/dashboard/notifications"),
    retry: 2,
    staleTime: 15 * 1000,
  });
}

export function useNotificationHistory() {
  return useQuery({
    queryKey: ["dashboard", "notifications", "history"],
    queryFn: () => fetchJSON<NotificationsResponse>("/api/dashboard/notifications?history=true"),
    staleTime: 15 * 1000,
  });
}

export function useWalletTransactions(enabled = true) {
  return useQuery({
    queryKey: ["dashboard", "wallet", "transactions"],
    queryFn: () => fetchJSON<WalletTransactionsResponse>("/api/dashboard/wallet/transactions"),
    enabled,
  });
}

export function useDismissNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      fetchJSON<{ success: true }>(
        `/api/dashboard/notifications/${encodeURIComponent(notificationId)}/dismiss`,
        { method: "POST" },
      ),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: ["dashboard", "notifications"] });
      const previous = queryClient.getQueryData<NotificationsResponse>(["dashboard", "notifications"]);
      queryClient.setQueryData<NotificationsResponse>(["dashboard", "notifications"], (current) => ({
        notifications: current?.notifications.filter((notification) => notification.id !== notificationId) ?? [],
      }));
      return { previous };
    },
    onError: (_error, _notificationId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["dashboard", "notifications"], context.previous);
      }
    },
  });
}

type LaunchPayload = {
  disputeId: string;
};

export function useLaunchDisputeWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ disputeId }: LaunchPayload) => {
      return fetchJSON<{ disputeId: string }>(
        `/api/dashboard/disputes/${disputeId}/launch`,
        {
          method: "POST",
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "disputes"] });
    },
  });
}

export type BusinessDetails = {
  legalName: string;
  representativeTitle: string;
};

export type PartyIdentity =
  | { type: "individual" }
  | { type: "business"; business: BusinessDetails };

export function useBusinessProfile() {
  return useQuery({
    queryKey: ["dashboard", "business-profile"],
    queryFn: () => fetchJSON<{ businessProfile: BusinessDetails | null }>("/api/dashboard/business-profile"),
  });
}

type EscrowActionPayload = {
  escrowId: string;
  signatureDataUrl?: string;
  counterpartyParty?: PartyIdentity;
};

type MilestoneActionPayload = {
  escrowId: string;
  milestoneId: string;
};

type MilestoneReviewPayload = MilestoneActionPayload & {
  reason: string;
};

type MilestoneSubmissionPayload = MilestoneActionPayload & {
  note: string;
};

type MilestoneChangeRequestPayload = MilestoneActionPayload & {
  title: string;
  description?: string;
  amount: number;
  deadline?: string;
  note?: string;
};

type MilestoneChangeReviewPayload = MilestoneActionPayload & {
  decision: "accept" | "reject";
  title?: string;
  description?: string;
  amount?: number;
  deadline?: string | null;
};

type AgreementMilestoneChangePayload = {
  milestoneId?: string;
  title: string;
  description?: string;
  amount: number;
  deadline?: string;
};

type AgreementChangeRequestPayload = {
  escrowId: string;
  milestones: AgreementMilestoneChangePayload[];
  note?: string;
};

type AgreementChangeReviewPayload = {
  escrowId: string;
  decision: "accept" | "reject";
  milestones?: AgreementMilestoneChangePayload[];
};

const buildEscrowAction =
  (path: string) =>
  () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ escrowId, ...payload }: EscrowActionPayload) =>
        fetchJSON<{ escrowId: string }>(`/api/dashboard/escrows/${escrowId}/${path}`, {
          method: "POST",
          headers: idempotencyHeaders(
            Object.keys(payload).length ? { "Content-Type": "application/json" } : undefined,
          ),
          ...(Object.keys(payload).length
            ? {
                body: JSON.stringify(payload),
              }
            : {}),
        }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard", "escrows"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard", "business-profile"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard", "notifications"] });
      },
    });
  };

export const useApproveEscrow = buildEscrowAction("approve");
export const useRejectEscrow = buildEscrowAction("reject");
export const useCancelEscrow = buildEscrowAction("cancel");
export const useFundEscrow = buildEscrowAction("fund");

export function useSignAgreement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ escrowId, signatureDataUrl }: { escrowId: string; signatureDataUrl: string }) =>
      fetchJSON<{ success: true }>(`/api/dashboard/escrows/${escrowId}/agreement/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureDataUrl }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "escrows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "notifications"] });
    },
  });
}

export function useResendInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ escrowId }: { escrowId: string }) =>
      fetchJSON<{ success: true }>(`/api/dashboard/escrows/${escrowId}/invitation/resend`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "escrows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "notifications"] });
    },
  });
}

export function useExtendInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ escrowId, days }: { escrowId: string; days: number }) =>
      fetchJSON<{ success: true }>(`/api/dashboard/escrows/${escrowId}/invitation/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "escrows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "notifications"] });
    },
  });
}

export function useUpdateDraftEscrow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ escrowId, ...payload }: DraftEscrowUpdatePayload) =>
      fetchJSON<{ escrowId: string; reference: string }>(
        `/api/dashboard/escrows/${escrowId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "escrows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "notifications"] });
    },
  });
}

const buildMilestoneAction =
  (path: string) =>
  () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ escrowId, milestoneId }: MilestoneActionPayload) =>
        fetchJSON<{ escrowId: string; milestoneId: number }>(
          `/api/dashboard/escrows/${escrowId}/milestones/${milestoneId}/${path}`,
          {
            method: "POST",
            headers: idempotencyHeaders(),
          },
        ),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard", "escrows"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard", "notifications"] });
      },
    });
  };

export const useApproveMilestone = buildMilestoneAction("approve");

export function useRejectMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ escrowId, milestoneId, reason }: MilestoneReviewPayload) =>
      fetchJSON<{ escrowId: string; milestoneId: number }>(
        `/api/dashboard/escrows/${escrowId}/milestones/${milestoneId}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "escrows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "notifications"] });
    },
  });
}

export function useSubmitMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ escrowId, milestoneId, note }: MilestoneSubmissionPayload) =>
      fetchJSON<{ escrowId: string; milestoneId: number; reviewDeadline: string }>(
        `/api/dashboard/escrows/${escrowId}/milestones/${milestoneId}/submit`,
        {
          method: "POST",
          headers: idempotencyHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ note }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "escrows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "notifications"] });
    },
  });
}

type OpenMilestoneDisputePayload = MilestoneActionPayload & { reason: string };

export function useOpenMilestoneDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ escrowId, milestoneId, reason }: OpenMilestoneDisputePayload) =>
      fetchJSON<{ disputeId: string; amountFrozenCents: number }>(
        `/api/dashboard/escrows/${escrowId}/milestones/${milestoneId}/dispute`,
        {
          method: "POST",
          headers: idempotencyHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ reason }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "escrows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "disputes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "notifications"] });
    },
  });
}

type DisputeEvidencePayload = {
  disputeId: string;
  note: string;
};

export function useSubmitDisputeEvidence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ disputeId, note }: DisputeEvidencePayload) =>
      fetchJSON<{ disputeId: string; evidenceSubmissionId: number }>(
        `/api/dashboard/disputes/${disputeId}/evidence`,
        {
          method: "POST",
          headers: idempotencyHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ note }),
        },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard", "disputes"] }),
  });
}

type DisputeResolutionPayload = {
  disputeId: string;
  sellerAmount: number;
  buyerAmount: number;
  note?: string;
};

export function useProposeDisputeResolution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ disputeId, ...payload }: DisputeResolutionPayload) =>
      fetchJSON<{ disputeId: string; status: string }>(
        `/api/dashboard/disputes/${disputeId}/resolution`,
        {
          method: "POST",
          headers: idempotencyHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "disputes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "notifications"] });
    },
  });
}

type FundedCancellationPayload = {
  escrowId: string;
  mode: "mutual" | "unilateral";
  reason: string;
};

export function useRequestFundedCancellation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ escrowId, ...payload }: FundedCancellationPayload) =>
      fetchJSON<{ cancellationId: string; status: string }>(
        `/api/dashboard/escrows/${escrowId}/cancellation/request`,
        {
          method: "POST",
          headers: idempotencyHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "escrows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "notifications"] });
    },
  });
}

export function useAcceptFundedCancellation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cancellationId }: { cancellationId: string }) =>
      fetchJSON<{ cancellationId: string; refundedCents: number; disputedCents: number }>(
        `/api/dashboard/cancellations/${cancellationId}/accept`,
        { method: "POST", headers: idempotencyHeaders() },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "escrows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "notifications"] });
    },
  });
}

export function useRequestMilestoneChanges() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ escrowId, milestoneId, ...payload }: MilestoneChangeRequestPayload) =>
      fetchJSON<{ escrowId: string; milestoneId: number }>(
        `/api/dashboard/escrows/${escrowId}/milestones/${milestoneId}/request-changes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "escrows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "notifications"] });
    },
  });
}

export function useRequestAgreementChanges() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ escrowId, ...payload }: AgreementChangeRequestPayload) =>
      fetchJSON<{ escrowId: string }>(
        `/api/dashboard/escrows/${escrowId}/request-changes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            milestones: payload.milestones.map((milestone) => ({
              ...milestone,
              milestoneId: milestone.milestoneId ? Number(milestone.milestoneId) : undefined,
            })),
          }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "escrows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "notifications"] });
    },
  });
}

export function useApplyMilestoneChanges() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ escrowId, milestoneId, ...payload }: MilestoneChangeReviewPayload) =>
      fetchJSON<{ escrowId: string; milestoneId: number }>(
        `/api/dashboard/escrows/${escrowId}/milestones/${milestoneId}/apply-changes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "escrows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "notifications"] });
    },
  });
}

export function useApplyAgreementChanges() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ escrowId, ...payload }: AgreementChangeReviewPayload) =>
      fetchJSON<{ escrowId: string }>(
        `/api/dashboard/escrows/${escrowId}/apply-changes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            milestones: payload.milestones?.map((milestone) => ({
              ...milestone,
              milestoneId: milestone.milestoneId ? Number(milestone.milestoneId) : undefined,
            })),
          }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "escrows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "notifications"] });
    },
  });
}

type ResolvePayload = {
  disputeId: string;
};

export function useResolveDispute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ disputeId }: ResolvePayload) =>
      fetchJSON<{ disputeId: string }>(
        `/api/dashboard/disputes/${disputeId}/resolve`,
        {
          method: "POST",
          headers: idempotencyHeaders(),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "disputes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "escrows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
    },
  });
}

type CreateEscrowPayload = {
  title: string;
  counterpartyEmail: string;
  amount: number;
  creatorRole: "buyer" | "seller";
  creatorParty: PartyIdentity;
  category?: string;
  description?: string;
  signatureDataUrl?: string;
  milestones?: Array<{
    title: string;
    amount: number;
    description?: string;
    deadline?: string;
  }>;
};

export type CreateEscrowResponse = {
  success: true;
  escrowId: number;
  reference?: string;
  counterpart?: string;
  createdAt?: string;
  invitationStatus?: "existing_user" | "signup_required" | "verification_required";
};

export function useCreateEscrow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateEscrowPayload) =>
      fetchJSON<CreateEscrowResponse>("/api/dashboard/escrows/create", {
        method: "POST",
        headers: idempotencyHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "escrows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "business-profile"] });
    },
  });
}

type WalletPayload = {
  amount: number;
};

export function useWalletTopup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ amount }: WalletPayload) =>
      fetchJSON<{ amount: number; balance: number }>("/api/dashboard/wallet/topup", {
        method: "POST",
        headers: idempotencyHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ amount }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "wallet", "transactions"] });
    },
  });
}

export function useWalletWithdraw() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ amount }: WalletPayload) =>
      fetchJSON<{ amount: number; balance: number }>("/api/dashboard/wallet/withdraw", {
        method: "POST",
        headers: idempotencyHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ amount }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "wallet", "transactions"] });
    },
  });
}
