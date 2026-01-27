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
        label: "Seller approval pending",
        detail: "Northwind onboarding kit is waiting for Nora Studio to approve.",
        meta: "Just now",
        txId: 10105,
      },
      {
        id: "notif-02",
        label: "Summit Legal payout",
        detail: "Escrow closed and final payment sent to Summit Legal.",
        meta: "1h ago",
        txId: 10103,
      },
      {
        id: "notif-03",
        label: "Wedding DJ approval",
        detail: "Waiting for Acme DJ Corp to approve the Wedding DJ escrow.",
        meta: "2h ago",
        txId: 10106,
      },
      {
        id: "notif-04",
        label: "Restaurant tile milestone",
        detail: 'Review "Material acquisition" for Tiles R\' Us so funds can release.',
        meta: "$100k pending",
        txId: 10107,
      },
    ],
  });
}
