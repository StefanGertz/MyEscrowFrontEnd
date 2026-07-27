import { NextRequest, NextResponse } from "next/server";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";

type EvidenceParams = {
  id: string;
  milestoneId: string;
  submissionId: string;
  evidenceId: string;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<EvidenceParams> },
) {
  const { id, milestoneId, submissionId, evidenceId } = await context.params;
  if (!isMockApiEnabled) {
    return proxyApiRequest(
      request,
      `/api/dashboard/escrows/${id}/milestones/${milestoneId}/submissions/${submissionId}/evidence/${evidenceId}`,
    );
  }

  return NextResponse.json({ error: "Proof downloads are unavailable in demo mode." }, { status: 404 });
}
