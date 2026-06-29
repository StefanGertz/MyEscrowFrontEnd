import { proxyApiRequest } from "@/lib/serverProxy";

export async function POST(request: Request) {
  return proxyApiRequest(request, "/api/auth/forgot-password");
}
