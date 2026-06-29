import { NextRequest, NextResponse } from "next/server";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";

type Payload = {
  amount: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
  if (!isMockApiEnabled) {
    return proxyApiRequest(request, "/api/dashboard/wallet/withdraw");
  }

  const body = (await request.json()) as Payload;
  await sleep(400);

  return NextResponse.json({
    success: true,
    amount: body.amount,
    type: "withdrawal",
    balance: 1250.5 - body.amount,
    completedAt: new Date().toISOString(),
  });
}
