import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { resolveSessionExpiresAt } from "@/lib/sessionExpiry";

const baseUrl = "https://staging-api.myescrow.example/v1";

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
      description?: string;
    };
    return HttpResponse.json({
      escrowId: 55555,
      title: body.title,
      description: body.description,
      counterpart: body.counterpartyEmail,
      amount: body.amount,
      success: true,
      invitationStatus: "existing_user",
    });
  }),
  http.get(`${baseUrl}/api/dashboard/business-profile`, () => {
    return HttpResponse.json({ businessProfile: null });
  }),
  http.post(`${baseUrl}/api/dashboard/escrows/:id/release`, ({ params }) => {
    return HttpResponse.json({
      escrowId: params.id,
      status: "released",
    });
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
  http.post(`${baseUrl}/api/dashboard/escrows/:id/milestones/:milestoneId/request-changes`, ({ params }) => {
    return HttpResponse.json({ success: true, escrowId: params.id, milestoneId: Number(params.milestoneId) });
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
