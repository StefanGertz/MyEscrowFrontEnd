import { NextRequest } from "next/server";
import { proxyApiRequest } from "@/lib/serverProxy";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyApiRequest(request, `/api/operations/jobs/${encodeURIComponent(id)}/retry`);
}
