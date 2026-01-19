import { NextResponse } from "next/server";

const useMocksFlag = process.env.NEXT_PUBLIC_USE_MOCKS ?? "true";

export const isMockApiEnabled = useMocksFlag !== "false";

export function mockDisabledResponse() {
  return NextResponse.json(
    {
      error: "Mock API disabled. Point NEXT_PUBLIC_API_BASE_URL to your backend.",
    },
    { status: 404 },
  );
}
