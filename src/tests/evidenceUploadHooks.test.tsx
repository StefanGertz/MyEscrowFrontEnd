import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch, apiFetchDirect } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  apiFetchDirect: vi.fn(),
}));

vi.mock("@/lib/apiClient", () => ({ apiFetch, apiFetchDirect }));

import { useSubmitDisputeEvidence, useSubmitMilestone } from "@/hooks/useDashboardData";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })}>
    {children}
  </QueryClientProvider>
);

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { "Content-Type": "application/json" },
});

beforeEach(() => {
  apiFetch.mockReset();
  apiFetchDirect.mockReset();
});

describe("managed evidence upload transport", () => {
  it("sends milestone proof multipart data through the direct API transport", async () => {
    apiFetchDirect.mockResolvedValue(jsonResponse({
      escrowId: "PO-1001",
      milestoneId: 12,
      reviewDeadline: "2026-08-09T00:00:00.000Z",
    }));
    const { result } = renderHook(() => useSubmitMilestone(), { wrapper });
    const photo = new File(["photo bytes"], "completion.jpeg", { type: "image/jpeg" });

    await act(async () => {
      await result.current.mutateAsync({
        escrowId: "PO-1001",
        milestoneId: "12",
        note: "Completed as agreed",
        files: [photo],
      });
    });

    expect(apiFetch).not.toHaveBeenCalled();
    expect(apiFetchDirect).toHaveBeenCalledOnce();
    const [path, init] = apiFetchDirect.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/dashboard/escrows/PO-1001/milestones/12/submit");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Idempotency-Key")).toBeTruthy();
    const body = init.body as FormData;
    expect(body.get("note")).toBe("Completed as agreed");
    expect(body.get("proofs")).toEqual(photo);
  });

  it("sends dispute file evidence directly but keeps note-only evidence on the normal transport", async () => {
    apiFetchDirect.mockResolvedValue(jsonResponse({ disputeId: "DSP-01", evidenceSubmissionId: 1 }));
    apiFetch.mockResolvedValue(jsonResponse({ disputeId: "DSP-01", evidenceSubmissionId: 2 }));
    const { result } = renderHook(() => useSubmitDisputeEvidence(), { wrapper });
    const document = new File(["document bytes"], "receipt.pdf", { type: "application/pdf" });

    await act(async () => {
      await result.current.mutateAsync({ disputeId: "DSP-01", note: "Receipt", files: [document] });
    });

    expect(apiFetchDirect).toHaveBeenCalledOnce();
    const [path, init] = apiFetchDirect.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/dashboard/disputes/DSP-01/evidence");
    expect(new Headers(init.headers).get("Idempotency-Key")).toBeTruthy();
    const body = init.body as FormData;
    expect(body.get("note")).toBe("Receipt");
    expect(body.get("evidence")).toEqual(document);

    await act(async () => {
      await result.current.mutateAsync({ disputeId: "DSP-01", note: "Context only", files: [] });
    });

    expect(apiFetch).toHaveBeenCalledOnce();
    expect(apiFetch.mock.calls[0]?.[0]).toBe("/api/dashboard/disputes/DSP-01/evidence");
  });
});
