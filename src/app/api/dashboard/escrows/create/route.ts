import { NextRequest, NextResponse } from "next/server";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";

type CreatePayload = {
  title: string;
  counterpart: string;
  counterpartyEmail: string;
  amount: number;
  creatorRole: "buyer" | "seller";
  category?: string;
  description?: string;
  milestones?: Array<{
    title: string;
    amount: number;
    description?: string;
  }>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
  if (!isMockApiEnabled) {
    return proxyApiRequest(request, "/api/dashboard/escrows/create");
  }

  const body = (await request.json()) as CreatePayload;
  await sleep(600);

  return NextResponse.json({
    success: true,
    escrowId: Math.floor(10000 + Math.random() * 90000),
    title: body.title,
    description: body.description,
    counterpart: body.counterpart,
    counterpartyEmail: body.counterpartyEmail,
    amount: body.amount,
    creatorRole: body.creatorRole,
    category: body.category,
    milestones: body.milestones,
    createdAt: new Date().toISOString(),
  });
}
