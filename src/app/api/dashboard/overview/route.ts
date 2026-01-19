import { NextResponse } from "next/server";
import {
  activeEscrows,
  summaryMetrics,
  timelineEvents,
} from "@/lib/mockDashboard";
import { isMockApiEnabled, mockDisabledResponse } from "@/lib/mockToggle";

export function GET() {
  if (!isMockApiEnabled) {
    return mockDisabledResponse();
  }

  return NextResponse.json({
    summaryMetrics,
    activeEscrows,
    timelineEvents,
  });
}
