import { NextRequest } from "next/server";
import { proxyApiRequest } from "@/lib/serverProxy";

export async function POST(request: NextRequest) {
  return proxyApiRequest(request, "/api/operations/operators/role");
}
