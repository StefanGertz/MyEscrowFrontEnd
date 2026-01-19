import { NextResponse } from "next/server";
import { reviewEscrows } from "@/lib/mockDashboard";
import { isMockApiEnabled, mockDisabledResponse } from "@/lib/mockToggle";

export function GET() {
  if (!isMockApiEnabled) {
    return mockDisabledResponse();
  }

  return NextResponse.json({
    escrows: reviewEscrows,
  });
}
