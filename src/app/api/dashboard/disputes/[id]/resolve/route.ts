import { NextRequest, NextResponse } from "next/server";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";

type Params = {
  params: {
    id: string;
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function GET() {
  return NextResponse.json({ status: "use POST" });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<Params["params"]> },
) {
  const { id } = await context.params;

  if (!isMockApiEnabled) {
    return proxyApiRequest(request, `/api/dashboard/disputes/${id}/resolve`);
  }

  await sleep(700);

  return NextResponse.json({
    success: true,
    disputeId: id,
    resolvedAt: new Date().toISOString(),
  });
}
