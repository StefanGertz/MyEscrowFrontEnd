import { NextRequest, NextResponse } from "next/server";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; milestoneId: string }> },
) {
  const { id, milestoneId } = await context.params;
  if (!isMockApiEnabled) {
    return proxyApiRequest(request, `/api/dashboard/escrows/${id}/milestones/${milestoneId}/dispute`);
  }
  return NextResponse.json({
    success: true,
    disputeId: `DSP-${Date.now()}`,
    escrowId: id,
    milestoneId: Number(milestoneId),
  });
}
