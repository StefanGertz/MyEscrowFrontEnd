import { NextResponse } from "next/server";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

const proxyErrorResponse = NextResponse.json(
  {
    error: "Mock API disabled but NEXT_PUBLIC_API_BASE_URL is not configured. Set it to your backend base URL.",
  },
  { status: 500 },
);

function resolveTarget(path: string) {
  if (!apiBaseUrl) {
    return null;
  }
  const trimmedBase = apiBaseUrl.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBase}${normalizedPath}`;
}

export async function proxyApiRequest(request: Request, path: string) {
  const targetUrl = resolveTarget(path);
  if (!targetUrl) {
    return proxyErrorResponse;
  }

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.text();
  }

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
    cache: "no-store",
  });

  const responseBody = await upstream.arrayBuffer();
  const responseHeaders = new Headers(upstream.headers);
  return new NextResponse(responseBody, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
