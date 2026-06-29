import { NextResponse } from "next/server";
import { disputeTickets } from "@/lib/mockDashboard";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";

export function GET(request: Request) {
  if (!isMockApiEnabled) {
    return proxyApiRequest(request, "/api/dashboard/disputes");
  }

  return NextResponse.json({
    disputes: disputeTickets,
  });
}
