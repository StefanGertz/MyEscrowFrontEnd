"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DisputeTicket,
  EscrowRecord,
  SummaryMetric,
  TimelineEvent,
} from "@/lib/mockDashboard";
import { apiFetch } from "@/lib/apiClient";

const fetchJSON = async <T>(input: string, init?: RequestInit): Promise<T> => {
  const response = await apiFetch(input, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
};

type OverviewResponse = {
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
  }>;
};

export function useEscrowSummary() {
  return useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => fetchJSON<OverviewResponse>("/api/dashboard/overview"),
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

type ReleasePayload = {
  escrowId: string;
};

type EscrowActionPayload = {
  escrowId: string;
};

export function useReleaseEscrow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ escrowId }: ReleasePayload) =>
      fetchJSON<{ escrowId: string }>(
        `/api/dashboard/escrows/${escrowId}/release`,
        {
          method: "POST",
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "escrows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
    },
  });
}

const buildEscrowAction =
  (path: string) =>
  () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ escrowId }: EscrowActionPayload) =>
        fetchJSON<{ escrowId: string }>(`/api/dashboard/escrows/${escrowId}/${path}`, {
          method: "POST",
        }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard", "escrows"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      },
    });
  };

export const useApproveEscrow = buildEscrowAction("approve");
export const useRejectEscrow = buildEscrowAction("reject");
export const useCancelEscrow = buildEscrowAction("cancel");

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
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "disputes"] });
    },
  });
}

type CreateEscrowPayload = {
  title: string;
  counterpart: string;
  amount: number;
  category?: string;
};

export function useCreateEscrow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateEscrowPayload) =>
      fetchJSON<{ escrowId: number }>("/api/dashboard/escrows/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "escrows"] });
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
    },
  });
}

export function useWalletWithdraw() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ amount }: WalletPayload) =>
      fetchJSON<{ amount: number; balance: number }>("/api/dashboard/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
    },
  });
}
