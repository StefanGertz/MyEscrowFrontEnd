import { NextResponse } from "next/server";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";

const defaultUser = {
  id: "user-001",
  name: "Scott",
  email: "scott@example.com",
};

const MOCK_PASSWORD = "Escrow123!";

export async function POST(request: Request) {
  if (!isMockApiEnabled) {
    return proxyApiRequest(request, "/api/auth/login");
  }
  const { email, password } = (await request.json()) as {
    email?: string;
    password?: string;
  };
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const isScott = normalizedEmail === defaultUser.email;
  if (!isScott || password !== MOCK_PASSWORD) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  return NextResponse.json({
    token: "mock-token",
    user: defaultUser,
  });
}
