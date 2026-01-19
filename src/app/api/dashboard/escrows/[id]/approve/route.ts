import { NextRequest, NextResponse } from "next/server";
import { isMockApiEnabled, mockDisabledResponse } from "@/lib/mockToggle";

type ActionParams = {
  params: {
    id: string;
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(
  _request: NextRequest,
  context: { params: Promise<ActionParams["params"]> },
) {
  if (!isMockApiEnabled) {
    return mockDisabledResponse();
  }

  await sleep(500);
  const { id } = await context.params;

  return NextResponse.json({
    success: true,
    escrowId: id,
    status: "approved",
    updatedAt: new Date().toISOString(),
  });
}
