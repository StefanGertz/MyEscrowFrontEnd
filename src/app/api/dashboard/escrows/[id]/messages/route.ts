import { NextResponse } from "next/server";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type MockMessage = {
  id: number;
  body: string;
  createdAt: string;
  sender: {
    id: string;
    name: string;
    role: "buyer" | "seller";
  };
};

const mockMessages = new Map<string, MockMessage[]>();
let nextMockMessageId = 1;

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const escrowId = decodeURIComponent(id);
  if (!isMockApiEnabled) {
    return proxyApiRequest(
      request,
      `/api/dashboard/escrows/${encodeURIComponent(escrowId)}/messages`,
    );
  }

  return NextResponse.json({
    escrowId,
    participants: [
      { id: "user-001", name: "Scott", role: "buyer" },
      { id: "mock-counterparty", name: "Counterparty", role: "seller" },
    ],
    canSend: true,
    unavailableReason: null,
    messages: mockMessages.get(escrowId) ?? [],
    nextCursor: null,
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const escrowId = decodeURIComponent(id);
  if (!isMockApiEnabled) {
    return proxyApiRequest(
      request,
      `/api/dashboard/escrows/${encodeURIComponent(escrowId)}/messages`,
    );
  }

  const payload = (await request.json()) as { body?: string };
  const body = payload.body?.trim() ?? "";
  if (!body || body.length > 5_000) {
    return NextResponse.json(
      { error: body ? "Message must be 5,000 characters or fewer." : "Message cannot be empty." },
      { status: 400 },
    );
  }
  const message: MockMessage = {
    id: nextMockMessageId++,
    body,
    createdAt: new Date().toISOString(),
    sender: { id: "user-001", name: "Scott", role: "buyer" },
  };
  mockMessages.set(escrowId, [...(mockMessages.get(escrowId) ?? []), message]);
  return NextResponse.json({ escrowId, message }, { status: 201 });
}
