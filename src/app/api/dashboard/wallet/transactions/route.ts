import { NextResponse } from "next/server";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";

export async function GET(request: Request) {
  if (!isMockApiEnabled) {
    return proxyApiRequest(request, "/api/dashboard/wallet/transactions");
  }
  return NextResponse.json({ transactions: [] });
}
