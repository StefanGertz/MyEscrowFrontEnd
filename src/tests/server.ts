import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const baseUrl = "https://staging-api.myescrow.example/v1";

export const handlers = [
  http.post(`${baseUrl}/api/dashboard/escrows/create`, async ({ request }) => {
    const body = (await request.json()) as {
      title: string;
      counterpart: string;
      amount: number;
      description?: string;
    };
    return HttpResponse.json({
      escrowId: 55555,
      title: body.title,
      description: body.description,
      counterpart: body.counterpart,
      amount: body.amount,
      success: true,
    });
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
];

export const server = setupServer(...handlers);
