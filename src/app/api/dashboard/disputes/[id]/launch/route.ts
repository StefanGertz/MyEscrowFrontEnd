import { NextRequest, NextResponse } from "next/server";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";

type LaunchParams = {
  params: {
    id: string;
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(
  request: NextRequest,
  context: { params: Promise<LaunchParams["params"]> },
) {
  const { id } = await context.params;

  if (!isMockApiEnabled) {
    return proxyApiRequest(request, `/api/dashboard/disputes/${id}/launch`);
  }

  await sleep(500);

  return NextResponse.json({
    success: true,
    disputeId: id,
    launchedAt: new Date().toISOString(),
  });
}
