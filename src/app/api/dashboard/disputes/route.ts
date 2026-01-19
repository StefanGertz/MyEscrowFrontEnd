import { NextResponse } from "next/server";
import { disputeTickets } from "@/lib/mockDashboard";
import { isMockApiEnabled, mockDisabledResponse } from "@/lib/mockToggle";

export function GET() {
  if (!isMockApiEnabled) {
    return mockDisabledResponse();
  }

  return NextResponse.json({
    disputes: disputeTickets,
  });
}
