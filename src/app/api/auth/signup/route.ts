import { NextResponse } from "next/server";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";

const randomId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `user-${Math.random().toString(36).slice(2, 10)}`;
};

export async function POST(request: Request) {
  if (!isMockApiEnabled) {
    return proxyApiRequest(request, "/api/auth/signup");
  }
  const { name, email, password } = (await request.json()) as {
    name?: string;
    email?: string;
    password?: string;
  };
  if (!name || !email || !password) {
    return NextResponse.json({ error: "Name, email, and password are required." }, { status: 400 });
  }
  return NextResponse.json({
    token: "mock-token",
    user: {
      id: randomId(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
    },
  });
}
