import { NextResponse } from "next/server";
import { proxyApiRequest } from "@/lib/serverProxy";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return proxyApiRequest(
      request,
      `/api/dashboard/escrows/${encodeURIComponent(id)}/ledger`,
    );
  } catch (error) {
    console.error("Ledger proxy failed", error);
    return NextResponse.json({ error: "Unable to load escrow ledger" }, { status: 500 });
  }
}
