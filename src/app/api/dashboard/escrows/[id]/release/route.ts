import { NextRequest, NextResponse } from "next/server";
import { isMockApiEnabled, mockDisabledResponse } from "@/lib/mockToggle";

type ReleaseParams = {
  params: {
    id: string;
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(
  _request: NextRequest,
  context: { params: Promise<ReleaseParams["params"]> },
) {
  if (!isMockApiEnabled) {
    return mockDisabledResponse();
  }

  await sleep(600);
  const { id } = await context.params;

  return NextResponse.json({
    success: true,
    escrowId: id,
    releasedAt: new Date().toISOString(),
  });
}
