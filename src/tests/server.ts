import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { resolveSessionExpiresAt } from "@/lib/sessionExpiry";
import {
  parseEscrowCreationDraftData,
  type StoredEscrowCreationDraft,
} from "@/lib/escrowCreationDraft";

const baseUrl = "https://staging-api.myescrow.example/v1";

let agreementDraft: StoredEscrowCreationDraft | null = null;
let agreementDraftRevision = 0;
let agreementDraftStateExists = false;

export const resetAgreementDraftFixture = () => {
  agreementDraft = null;
  agreementDraftRevision = 0;
  agreementDraftStateExists = false;
};

const agreementDraftResponseValue = () => {
  if (!agreementDraft) return null;
  const draft: Partial<StoredEscrowCreationDraft> = { ...agreementDraft };
  delete draft.serverRevision;
  delete draft.hasLocalChanges;
  return draft;
};

const sessionResponse = (email: string) => ({
  token: "test-token",
  expiresAt: resolveSessionExpiresAt(),
  user: {
    id: "user-session",
    name: email.split("@")[0] || "Tester",
    email,
  },
});

export const handlers = [
  http.post(`${baseUrl}/api/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    return HttpResponse.json(sessionResponse(body.email));
  }),
  http.post(`${baseUrl}/api/auth/signup`, async ({ request }) => {
    const body = (await request.json()) as { name: string; email: string; password: string };
    return HttpResponse.json({
      verificationRequired: true,
      email: body.email,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      debugCode: "123456",
    });
  }),
  http.post(`${baseUrl}/api/auth/verify-email`, async ({ request }) => {
    const body = (await request.json()) as { email: string; code: string };
    if (body.code !== "123456") {
      return HttpResponse.json({ error: "Invalid code" }, { status: 400 });
    }
    return HttpResponse.json(sessionResponse(body.email));
  }),
  http.post(`${baseUrl}/api/auth/resend-verification`, async ({ request }) => {
    const body = (await request.json()) as { email: string };
    return HttpResponse.json({
      verificationRequired: true,
      email: body.email,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      debugCode: "123456",
    });
  }),
  http.post(`${baseUrl}/api/auth/forgot-password`, async ({ request }) => {
    const body = (await request.json()) as { email: string };
    return HttpResponse.json({
      accepted: true,
      email: body.email,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      debugCode: "654321",
    });
  }),
  http.post(`${baseUrl}/api/auth/reset-password`, async ({ request }) => {
    const body = (await request.json()) as { email: string; code: string; password: string };
    if (body.code !== "654321") {
      return HttpResponse.json({ error: "Invalid or expired reset code." }, { status: 400 });
    }
    return HttpResponse.json({ success: true, email: body.email });
  }),
  http.post(`${baseUrl}/api/auth/change-password`, async ({ request }) => {
    const body = (await request.json()) as { currentPassword: string; newPassword: string };
    if (body.currentPassword !== "CurrentPassword123!") {
      return HttpResponse.json({ error: "Current password is incorrect." }, { status: 401 });
    }
    return HttpResponse.json({ success: true });
  }),
  http.post(`${baseUrl}/api/dashboard/escrows/create`, async ({ request }) => {
    const body = (await request.json()) as {
      title: string;
      counterpartyEmail: string;
      amount: number;
      draftRevision?: number;
      fundingMode?: "full" | "milestone";
      description?: string;
    };
    if (!agreementDraftStateExists) {
      if (body.draftRevision !== undefined && body.draftRevision !== 0) {
        return HttpResponse.json({ error: "The agreement draft changed in another session." }, { status: 409 });
      }
      agreementDraftRevision = 1;
      agreementDraftStateExists = true;
    } else if (
      (agreementDraft && body.draftRevision !== agreementDraftRevision)
      || (body.draftRevision !== undefined && body.draftRevision !== agreementDraftRevision)
    ) {
      return HttpResponse.json({ error: "The agreement draft changed in another session." }, { status: 409 });
    } else {
      agreementDraftRevision += 1;
    }
    agreementDraft = null;
    return HttpResponse.json({
      escrowId: 55555,
      title: body.title,
      description: body.description,
      counterpart: body.counterpartyEmail,
      amount: body.amount,
      fundingMode: body.fundingMode,
      success: true,
      invitationStatus: "existing_user",
    });
  }),
  http.get(`${baseUrl}/api/dashboard/agreement-draft`, () => {
    return HttpResponse.json({
      draft: agreementDraftResponseValue(),
      revision: agreementDraftRevision,
    });
  }),
  http.put(`${baseUrl}/api/dashboard/agreement-draft`, async ({ request }) => {
    const body = await request.json() as { baseRevision?: unknown; draft?: unknown };
    const draftInput = parseEscrowCreationDraftData(body.draft);
    if (!Number.isSafeInteger(body.baseRevision) || (body.baseRevision as number) < 0 || !draftInput) {
      return HttpResponse.json({ error: "The agreement draft payload was invalid." }, { status: 400 });
    }
    if (body.baseRevision !== agreementDraftRevision) {
      return HttpResponse.json({ error: "The agreement draft changed in another session." }, { status: 409 });
    }
    const updatedAt = new Date().toISOString();
    agreementDraftRevision += 1;
    agreementDraftStateExists = true;
    agreementDraft = {
      ...draftInput,
      createdAt: agreementDraft?.createdAt ?? updatedAt,
      updatedAt,
      serverRevision: agreementDraftRevision,
      hasLocalChanges: false,
    };
    return HttpResponse.json({
      draft: agreementDraftResponseValue(),
      revision: agreementDraftRevision,
    });
  }),
  http.delete(`${baseUrl}/api/dashboard/agreement-draft`, async ({ request }) => {
    const body = await request.json() as { baseRevision?: unknown };
    if (!Number.isSafeInteger(body.baseRevision) || (body.baseRevision as number) < 0) {
      return HttpResponse.json({ error: "The agreement draft payload was invalid." }, { status: 400 });
    }
    if (!agreementDraftStateExists) {
      if (body.baseRevision !== 0) {
        return HttpResponse.json({ error: "The agreement draft changed in another session." }, { status: 409 });
      }
      agreementDraftRevision = 1;
      agreementDraftStateExists = true;
    } else if (
      !agreementDraft
      && (body.baseRevision === agreementDraftRevision
        || (body.baseRevision as number) + 1 === agreementDraftRevision)
    ) {
      return HttpResponse.json({ success: true, draft: null, revision: agreementDraftRevision });
    } else if (body.baseRevision === agreementDraftRevision && agreementDraft) {
      agreementDraftRevision += 1;
    } else {
      return HttpResponse.json({ error: "The agreement draft changed in another session." }, { status: 409 });
    }
    agreementDraft = null;
    return HttpResponse.json({ success: true, draft: null, revision: agreementDraftRevision });
  }),
  http.get(`${baseUrl}/api/dashboard/business-profile`, () => {
    return HttpResponse.json({ businessProfile: null });
  }),
  http.get(`${baseUrl}/api/dashboard/escrows/:id/messages`, ({ params }) => {
    return HttpResponse.json({
      escrowId: params.id,
      participants: [
        { id: "user-session", name: "Tester", role: "buyer" },
        { id: "seller-1", name: "Seller", role: "seller" },
      ],
      canSend: true,
      unavailableReason: null,
      messages: [
        {
          id: 1,
          body: "The delivery window works for me.",
          createdAt: "2026-07-29T12:00:00.000Z",
          sender: { id: "seller-1", name: "Seller", role: "seller" },
        },
      ],
      nextCursor: null,
    });
  }),
  http.post(`${baseUrl}/api/dashboard/escrows/:id/messages`, async ({ params, request }) => {
    const body = (await request.json()) as { body: string };
    return HttpResponse.json({
      escrowId: params.id,
      message: {
        id: 2,
        body: body.body,
        createdAt: "2026-07-29T12:01:00.000Z",
        sender: { id: "user-session", name: "Tester", role: "buyer" },
      },
    }, { status: 201 });
  }),
  http.post(`${baseUrl}/api/dashboard/escrows/:id/approve`, ({ params }) => {
    return HttpResponse.json({
      escrowId: params.id,
      status: "approved",
    });
  }),
  http.post(`${baseUrl}/api/dashboard/escrows/:id/reject`, ({ params }) => {
    return HttpResponse.json({
      escrowId: params.id,
      status: "rejected",
    });
  }),
  http.post(`${baseUrl}/api/dashboard/escrows/:id/cancel`, ({ params }) => {
    return HttpResponse.json({
      escrowId: params.id,
      status: "cancelled",
    });
  }),
  http.post(`${baseUrl}/api/dashboard/escrows/:id/milestones/:milestoneId/fund`, async ({ params, request }) => {
    const payload = await request.json() as { amount: number };
    return HttpResponse.json({
      success: true,
      escrowId: params.id,
      milestoneId: Number(params.milestoneId),
      fundingStatus: "partially_funded",
      depositedCents: Math.round(payload.amount * 100),
      fundedCents: Math.round(payload.amount * 100),
      remainingCents: 0,
      allocations: [],
    });
  }),
  http.post(`${baseUrl}/api/dashboard/escrows/:id/milestones/:milestoneId/request-changes`, ({ params }) => {
    return HttpResponse.json({ success: true, escrowId: params.id, milestoneId: Number(params.milestoneId) });
  }),
  http.post(`${baseUrl}/api/dashboard/escrows/:id/agreement-changes`, ({ params }) => {
    return HttpResponse.json({ success: true, escrowId: params.id });
  }),
  http.post(`${baseUrl}/api/dashboard/escrows/:id/request-changes`, ({ params }) => {
    return HttpResponse.json({ success: true, escrowId: params.id });
  }),
  http.post(`${baseUrl}/api/dashboard/escrows/:id/milestones/:milestoneId/apply-changes`, ({ params }) => {
    return HttpResponse.json({ success: true, escrowId: params.id, milestoneId: Number(params.milestoneId) });
  }),
  http.post(`${baseUrl}/api/dashboard/notifications/:id/dismiss`, () => {
    return HttpResponse.json({ success: true });
  }),
  http.post(`${baseUrl}/api/dashboard/disputes/:id/resolve`, ({ params }) => {
    return HttpResponse.json({
      disputeId: params.id,
      resolvedAt: new Date().toISOString(),
    });
  }),
  http.post(`${baseUrl}/api/dashboard/disputes/:id/arbitration`, ({ params }) => {
    return HttpResponse.json({
      disputeId: params.id,
      status: "arbitration_requested",
      arbitrationRequestedAt: new Date().toISOString(),
    });
  }),
  http.post(`${baseUrl}/api/dashboard/wallet/topup`, async ({ request }) => {
    const body = (await request.json()) as { amount: number };
    return HttpResponse.json({
      success: true,
      balance: 1250.5 + body.amount,
    });
  }),
  http.post(`${baseUrl}/api/dashboard/wallet/withdraw`, async ({ request }) => {
    const body = (await request.json()) as { amount: number };
    return HttpResponse.json({
      success: true,
      balance: 1250.5 - body.amount,
    });
  }),
  http.get(`${baseUrl}/api/dashboard/wallet/transactions`, () => {
    return HttpResponse.json({ transactions: [] });
  }),
];

export const server = setupServer(...handlers);
