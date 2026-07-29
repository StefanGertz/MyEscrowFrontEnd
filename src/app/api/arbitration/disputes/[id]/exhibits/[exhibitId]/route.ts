import { NextRequest, NextResponse } from "next/server";
import { proxyApiRequest } from "@/lib/serverProxy";

type ExhibitParams = {
  id: string;
  exhibitId: string;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<ExhibitParams> },
) {
  const { id, exhibitId } = await context.params;
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    return NextResponse.json(
      { error: "Arbitration exhibits require a live arbitration record." },
      { status: 409 },
    );
  }
  return proxyApiRequest(
    request,
    `/api/arbitration/disputes/${encodeURIComponent(id)}/exhibits/${encodeURIComponent(exhibitId)}`,
  );
}
