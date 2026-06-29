import { NextRequest, NextResponse } from "next/server";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";

type ReleaseParams = {
  params: {
    id: string;
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(
  request: NextRequest,
  context: { params: Promise<ReleaseParams["params"]> },
) {
  const { id } = await context.params;

  if (!isMockApiEnabled) {
    return proxyApiRequest(request, `/api/dashboard/escrows/${id}/release`);
  }

  await sleep(600);

  return NextResponse.json({
    success: true,
    escrowId: id,
    releasedAt: new Date().toISOString(),
  });
}
