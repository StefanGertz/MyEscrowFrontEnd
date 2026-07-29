import { NextRequest, NextResponse } from "next/server";
import { proxyApiRequest } from "@/lib/serverProxy";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    return NextResponse.json(
      { error: "Arbitration reports require a live arbitration record." },
      { status: 409 },
    );
  }
  return proxyApiRequest(
    request,
    `/api/dashboard/disputes/${encodeURIComponent(id)}/arbitration-report`,
  );
}
