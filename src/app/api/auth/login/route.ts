import { NextResponse } from "next/server";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";

const defaultUser = {
  id: "user-001",
  name: "Scott",
  email: "scott@example.com",
};

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
  const user =
    normalizedEmail === defaultUser.email
      ? defaultUser
      : {
          id: `user-${normalizedEmail.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "demo"}`,
          name: normalizedEmail.split("@")[0]?.replace(/\./g, " ").replace(/^\w/, (char) => char.toUpperCase()) || "Demo User",
          email: normalizedEmail,
        };
  return NextResponse.json({
    token: "mock-token",
    user,
  });
}
