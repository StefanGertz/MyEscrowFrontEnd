import { NextRequest } from "next/server";
import { proxyApiRequest } from "@/lib/serverProxy";

export async function GET(request: NextRequest) {
  return proxyApiRequest(request, "/api/operations/operators");
}
