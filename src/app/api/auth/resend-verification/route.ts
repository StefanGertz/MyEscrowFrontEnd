import { proxyApiRequest } from "@/lib/serverProxy";

export async function POST(request: Request) {
  return proxyApiRequest(request, "/api/auth/resend-verification");
}
