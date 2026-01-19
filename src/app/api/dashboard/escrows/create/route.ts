import { NextRequest, NextResponse } from "next/server";
import { isMockApiEnabled, mockDisabledResponse } from "@/lib/mockToggle";

type CreatePayload = {
  title: string;
  counterpart: string;
  amount: number;
  category?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
  if (!isMockApiEnabled) {
    return mockDisabledResponse();
  }

  const body = (await request.json()) as CreatePayload;
  await sleep(600);

  return NextResponse.json({
    success: true,
    escrowId: Math.floor(10000 + Math.random() * 90000),
    title: body.title,
    counterpart: body.counterpart,
    amount: body.amount,
    category: body.category,
    createdAt: new Date().toISOString(),
  });
}
