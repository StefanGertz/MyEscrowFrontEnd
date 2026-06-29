import { NextResponse } from "next/server";
import {
  activeEscrows,
  summaryMetrics,
  timelineEvents,
} from "@/lib/mockDashboard";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";

export function GET(request: Request) {
  if (!isMockApiEnabled) {
    return proxyApiRequest(request, "/api/dashboard/overview");
  }

  return NextResponse.json({
    summaryMetrics,
    activeEscrows,
    timelineEvents,
  });
}
