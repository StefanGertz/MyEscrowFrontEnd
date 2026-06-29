import { NextRequest, NextResponse } from "next/server";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";

type ActionParams = {
  params: {
    id: string;
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(
  request: NextRequest,
  context: { params: Promise<ActionParams["params"]> },
) {
  const { id } = await context.params;

  if (!isMockApiEnabled) {
    return proxyApiRequest(request, `/api/dashboard/escrows/${id}/fund`);
  }

  await sleep(500);

  return NextResponse.json({
    success: true,
    escrowId: id,
    status: "funded",
    fundedAt: new Date().toISOString(),
  });
}
