import { NextRequest } from "next/server";
import { proxyApiRequest } from "@/lib/serverProxy";

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status");
  const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
  return proxyApiRequest(request, `/api/operations/jobs${suffix}`);
}
