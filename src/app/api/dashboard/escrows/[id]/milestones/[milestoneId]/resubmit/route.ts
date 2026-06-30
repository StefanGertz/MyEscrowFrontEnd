import { NextRequest, NextResponse } from "next/server";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";

type ActionParams = {
  params: {
    id: string;
    milestoneId: string;
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(
  request: NextRequest,
  context: { params: Promise<ActionParams["params"]> },
) {
  const { id, milestoneId } = await context.params;

  if (!isMockApiEnabled) {
    return proxyApiRequest(request, `/api/dashboard/escrows/${id}/milestones/${milestoneId}/resubmit`);
  }

  await sleep(500);

  return NextResponse.json({
    success: true,
    escrowId: id,
    milestoneId: Number(milestoneId),
  });
}
