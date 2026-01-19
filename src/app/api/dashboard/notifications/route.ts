import { NextResponse } from "next/server";
import { isMockApiEnabled, mockDisabledResponse } from "@/lib/mockToggle";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function GET() {
  if (!isMockApiEnabled) {
    return mockDisabledResponse();
  }

  await sleep(200);
  return NextResponse.json({
    notifications: [
      {
        id: "notif-01",
        label: "Buyer funding pending",
        detail: "Northwind Agency launch requires a deposit.",
        meta: "Just now",
      },
      {
        id: "notif-02",
        label: "Milestone approval",
        detail: "Cloud Harbor milestone awaiting your review.",
        meta: "10m ago",
      },
    ],
  });
}
