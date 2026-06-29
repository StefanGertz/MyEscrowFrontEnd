import { NextResponse } from "next/server";
import { reviewEscrows } from "@/lib/mockDashboard";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";

export function GET(request: Request) {
  if (!isMockApiEnabled) {
    return proxyApiRequest(request, "/api/dashboard/escrows");
  }

  return NextResponse.json({
    escrows: reviewEscrows,
  });
}
