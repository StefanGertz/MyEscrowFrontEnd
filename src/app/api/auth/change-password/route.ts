import { NextResponse } from "next/server";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";

const MOCK_PASSWORD = "password123";

export async function POST(request: Request) {
  if (!isMockApiEnabled) {
    return proxyApiRequest(request, "/api/auth/change-password");
  }
  const { currentPassword, newPassword } = (await request.json()) as {
    currentPassword?: string;
    newPassword?: string;
  };
  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Current password and new password are required." },
      { status: 400 },
    );
  }
  if (currentPassword !== MOCK_PASSWORD) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
  }
  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: "New password must be different from your current password." },
      { status: 400 },
    );
  }
  return NextResponse.json({ success: true });
}
