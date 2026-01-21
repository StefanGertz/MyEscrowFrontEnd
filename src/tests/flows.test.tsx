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
  useWalletTopup,
  useWalletWithdraw,
} from "@/hooks/useDashboardData";
import { server } from "./server";

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

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
