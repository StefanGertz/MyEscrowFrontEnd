import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OperationsEscrowPage from "@/app/operations/escrows/[id]/page";
import { ConfirmDialogProvider } from "@/components/ConfirmDialogProvider";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/apiClient", () => ({ apiFetch: apiFetchMock }));
vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ isAuthenticated: true, isHydrating: false }),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "PO-0675" }),
  useRouter: () => ({ replace: vi.fn() }),
}));

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

const escrowRecord = (resolved: boolean) => ({
  id: "PO-0675",
  title: "Administrative cancellation",
  counterpart: "Seller",
  amount: "$100.00",
  stage: resolved ? "Cancelled and refunded" : "Cancellation under review",
  due: resolved ? "Unreleased funds returned to buyer" : "Funds held for administrative review",
  status: "warning",
  counterpartyApproved: true,
  lifecycleStatus: resolved ? "cancelled" : "cancellation_review",
  fundingStatus: resolved ? "refunded" : "funded",
  createdAt: "2026-07-30T21:28:55.000Z",
  buyer: { id: "buyer", name: "Buyer", email: "buyer@example.com" },
  seller: { id: "seller", name: "Seller", email: "seller@example.com" },
  balances: {
    currency: "USD",
    fundedCents: 10_000,
    heldCents: resolved ? 0 : 10_000,
    releasedCents: 0,
    refundedCents: resolved ? 10_000 : 0,
    disputedCents: 0,
  },
  cancellation: {
    id: "CN-0001",
    mode: "unilateral",
    reason: "The work was not completed.",
    status: resolved ? "executed_documented_full_refund" : "escalated",
    requestedById: "buyer",
    requestedAt: "2026-07-31T04:13:40.000Z",
    refundAmountCents: resolved ? 10_000 : 0,
    reviewMessages: resolved ? [{
      id: 1,
      kind: "execute_documented_full_refund",
      body: "Execute the exact full refund directed by the retained final order.",
      authorRole: "admin",
      createdAt: "2026-07-31T12:00:00.000Z",
      author: { id: "admin", name: "Admin", email: "admin@example.com" },
    }] : [],
    ...(resolved ? {
      administrativeAction: "execute_documented_full_refund",
      reviewNote: "Execute the exact full refund directed by the retained final order.",
      authorityType: "court_order",
      authorityReference: "COURT-2026-1842",
      authorityEffectiveAt: "2026-07-30T00:00:00.000Z",
      authorityDocumentSha256: "a".repeat(64),
      authorityVerifiedAt: "2026-07-31T12:00:00.000Z",
      authorizedRefundCents: 10_000,
      lastReviewedAt: "2026-07-31T12:00:00.000Z",
      respondedAt: "2026-07-31T12:00:00.000Z",
    } : {}),
  },
  agreement: null,
  milestones: [{
    id: 1,
    title: "Delivery",
    amount: "$100.00",
    fundingStatus: "funded",
    fundedCents: 10_000,
    status: resolved ? "cancelled" : "not_started",
  }],
});

afterEach(() => {
  cleanup();
  apiFetchMock.mockReset();
});

describe("administrative cancellation review", () => {
  it("requests information without requiring procedural-closure fields", async () => {
    apiFetchMock.mockImplementation(async (_input: string, init?: RequestInit) => (
      init?.method === "POST"
        ? jsonResponse({ success: true, status: "information_requested", refundedCents: 0 })
        : jsonResponse({ currentRole: "admin", escrow: escrowRecord(false) })
    ));

    render(
      <ConfirmDialogProvider>
        <OperationsEscrowPage />
      </ConfirmDialogProvider>,
    );

    fireEvent.change(await screen.findByLabelText("Administrative rationale or information request"), {
      target: { value: "Provide the objective notice date and delivery record." },
    });
    fireEvent.change(screen.getByLabelText("Request information from"), {
      target: { value: "seller" },
    });
    const requestButton = screen.getByRole("button", { name: "Request information" });
    expect(requestButton).toBeEnabled();
    fireEvent.click(requestButton);
    fireEvent.click(screen.getAllByRole("button", { name: "Request information" })[1]!);

    await waitFor(() => {
      const postCall = apiFetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
        action: "request_information",
        rationale: "Provide the objective notice date and delivery record.",
        recipient: "seller",
      });
    });
    expect(await screen.findByText("Information requested from the seller. The funds remain held.")).toBeInTheDocument();
  });

  it("requires final-authority details and submits the exact full refund", async () => {
    let resolved = false;
    apiFetchMock.mockImplementation(async (_input: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        resolved = true;
        return jsonResponse({
          success: true,
          status: "executed_documented_full_refund",
          refundedCents: 10_000,
        });
      }
      return jsonResponse({ currentRole: "admin", escrow: escrowRecord(resolved) });
    });

    render(
      <ConfirmDialogProvider>
        <OperationsEscrowPage />
      </ConfirmDialogProvider>,
    );

    expect(await screen.findByText("Cancellation and refunds")).toBeInTheDocument();
    expect(screen.getByText("Undisputed held balance").parentElement).toHaveTextContent("$100.00");
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Administrative rationale or information request"), {
      target: { value: "Execute the exact full refund directed by the retained final order." },
    });
    fireEvent.change(screen.getByLabelText("Authority reference"), {
      target: { value: "COURT-2026-1842" },
    });
    fireEvent.change(screen.getByLabelText("Retained document SHA-256"), {
      target: { value: "a".repeat(64) },
    });
    fireEvent.click(screen.getByLabelText(/I attest that the retained document is final/));
    fireEvent.click(screen.getByRole("button", { name: "Execute final-authority full refund $100.00" }));

    expect(screen.getByText("Execute final-authority full refund?")).toBeInTheDocument();
    expect(screen.getByText(/\$100\.00 of held, undisputed funds/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Execute full refund" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/operations/cancellations/CN-0001/actions",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const postCall = apiFetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual(expect.objectContaining({
      action: "execute_documented_full_refund",
      authorityType: "court_order",
      authorityReference: "COURT-2026-1842",
      authorityDocumentSha256: "a".repeat(64),
      authorizedRefundCents: 10_000,
      authorityVerified: true,
    }));
    expect(await screen.findByText("Final authority executed. $100.00 was refunded to the buyer.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Execute final-authority/ })).not.toBeInTheDocument();
  });
});
