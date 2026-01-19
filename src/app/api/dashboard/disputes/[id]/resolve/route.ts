import { NextRequest, NextResponse } from "next/server";
import { isMockApiEnabled, mockDisabledResponse } from "@/lib/mockToggle";

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
  _request: NextRequest,
  context: { params: Promise<Params["params"]> },
) {
  if (!isMockApiEnabled) {
    return mockDisabledResponse();
  }

  await sleep(700);
  const { id } = await context.params;

  return NextResponse.json({
    success: true,
    disputeId: id,
    resolvedAt: new Date().toISOString(),
  });
}
