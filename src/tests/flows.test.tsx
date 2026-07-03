import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  useCreateEscrow,
  useReleaseEscrow,
  useResolveDispute,
  useApproveEscrow,
  useRejectEscrow,
  useCancelEscrow,
  useDismissNotification,
  useRequestMilestoneChanges,
  useApplyMilestoneChanges,
  useWalletTopup,
  useWalletWithdraw,
} from "@/hooks/useDashboardData";
import { server } from "./server";

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const createWrapper = (queryClient = createQueryClient()) => {

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  Wrapper.displayName = "QueryClientTestProvider";

  return Wrapper;
};

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://staging-api.myescrow.example/v1";
  process.env.NEXT_PUBLIC_USE_MOCKS = "false";
  server.listen();
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe("escrow flows", () => {
  it("creates and releases an escrow via staging API", async () => {
    const wrapper = createWrapper();
    const createHook = renderHook(() => useCreateEscrow(), { wrapper });
    let createdId: number | undefined;

    await act(async () => {
      const response = await createHook.result.current.mutateAsync({
        title: "Integration escrow",
        counterpart: "Northwind Agency",
        amount: 75000,
        category: "Services",
        description: "Staging test escrow",
      });
      createdId = response.escrowId;
      expect(response.success).toBeTruthy();
    });

    expect(createdId).toBeDefined();

    const releaseHook = renderHook(() => useReleaseEscrow(), { wrapper });
    await act(async () => {
      const response = await releaseHook.result.current.mutateAsync({
        escrowId: String(createdId),
      });
      expect(response.status).toBe("released");
    });
  });
});

describe("approval flows", () => {
  it("approves, rejects, and cancels an escrow", async () => {
    const wrapper = createWrapper();
    const approveHook = renderHook(() => useApproveEscrow(), { wrapper });
    const rejectHook = renderHook(() => useRejectEscrow(), { wrapper });
    const cancelHook = renderHook(() => useCancelEscrow(), { wrapper });

    await act(async () => {
      const response = await approveHook.result.current.mutateAsync({
        escrowId: "111",
      });
      expect(response.status).toBe("approved");
    });

    await act(async () => {
      const response = await rejectHook.result.current.mutateAsync({
        escrowId: "111",
      });
      expect(response.status).toBe("rejected");
    });

    await act(async () => {
      const response = await cancelHook.result.current.mutateAsync({
        escrowId: "111",
      });
      expect(response.status).toBe("cancelled");
    });
  });
});

describe("dispute flows", () => {
  it("resolves a dispute via staging API", async () => {
    const wrapper = createWrapper();
    const resolveHook = renderHook(() => useResolveDispute(), { wrapper });

    await act(async () => {
      const response = await resolveHook.result.current.mutateAsync({
        disputeId: "DSP-01",
      });
      expect(response.disputeId).toBe("DSP-01");
      expect(response.resolvedAt).toBeTruthy();
    });
  });
});

describe("notification flows", () => {
  it("removes a dismissed notification from the cached inbox", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(["dashboard", "notifications"], {
      notifications: [
        { id: "notif-1", label: "Alert", detail: "Needs review", meta: "Just now" },
      ],
    });
    queryClient.setQueryData(["dashboard", "notifications", "history"], {
      notifications: [
        { id: "notif-1", label: "Alert", detail: "Needs review", meta: "Just now" },
      ],
    });
    const wrapper = createWrapper(queryClient);
    const dismissHook = renderHook(() => useDismissNotification(), { wrapper });

    await act(async () => {
      await dismissHook.result.current.mutateAsync("notif-1");
    });

    expect(queryClient.getQueryData(["dashboard", "notifications"])).toEqual({ notifications: [] });
    expect(queryClient.getQueryData(["dashboard", "notifications", "history"])).toEqual({
      notifications: [
        { id: "notif-1", label: "Alert", detail: "Needs review", meta: "Just now" },
      ],
    });
  });
});

describe("pre-approval milestone changes", () => {
  it("requests and applies milestone revisions", async () => {
    const wrapper = createWrapper();
    const requestHook = renderHook(() => useRequestMilestoneChanges(), { wrapper });
    const applyHook = renderHook(() => useApplyMilestoneChanges(), { wrapper });

    await act(async () => {
      const response = await requestHook.result.current.mutateAsync({
        escrowId: "PO-1001",
        milestoneId: "12",
        title: "Revised wording",
        amount: 750,
        deadline: "2026-08-15T00:00:00.000Z",
        note: "Please extend the deadline.",
      });
      expect(response.milestoneId).toBe(12);
    });

    await act(async () => {
      const response = await applyHook.result.current.mutateAsync({ escrowId: "PO-1001", milestoneId: "12" });
      expect(response.escrowId).toBe("PO-1001");
    });
  });
});

describe("wallet flows", () => {
  it("tops up and withdraws", async () => {
    const wrapper = createWrapper();
    const topupHook = renderHook(() => useWalletTopup(), { wrapper });
    const withdrawHook = renderHook(() => useWalletWithdraw(), { wrapper });

    await act(async () => {
      const response = await topupHook.result.current.mutateAsync({ amount: 1000 });
      expect(response.balance).toBeGreaterThan(1250.5);
    });

    await act(async () => {
      const response = await withdrawHook.result.current.mutateAsync({ amount: 300 });
      expect(response.balance).toBeLessThan(1250.5);
    });
  });
});
