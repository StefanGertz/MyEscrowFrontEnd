import { NextRequest, NextResponse } from "next/server";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isMockApiEnabled) {
    return proxyApiRequest(request, `/api/dashboard/disputes/${id}/arbitration`);
  }
  return NextResponse.json({
    success: true,
    disputeId: id,
    status: "arbitration_requested",
    arbitrationRequestedAt: new Date().toISOString(),
  });
}
