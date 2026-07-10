import { NextRequest, NextResponse } from "next/server";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isMockApiEnabled) {
    return proxyApiRequest(request, `/api/dashboard/escrows/${encodeURIComponent(id)}`);
  }

  const body = await request.json();
  return NextResponse.json({
    success: true,
    escrowId: id,
    reference: id,
    counterpart: body.counterpartyEmail,
    invitationStatus: "signup_required",
    updatedAt: new Date().toISOString(),
  });
}
