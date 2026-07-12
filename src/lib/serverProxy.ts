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

type ProxyOptions = {
  fallbackPaths?: string[];
};

const isRouteNotFoundResponse = (status: number, body: ArrayBuffer) => {
  if (status !== 404) {
    return false;
  }
  try {
    const text = new TextDecoder().decode(body);
    return /Route\s+\w+:\/api\/.+\s+not found/.test(text);
  } catch {
    return false;
  }
};

export async function proxyApiRequest(request: Request, path: string, options: ProxyOptions = {}) {
  const paths = [path, ...(options.fallbackPaths ?? [])];
  const targetUrls = paths.map(resolveTarget);
  if (targetUrls.some((targetUrl) => !targetUrl)) {
    return proxyErrorResponse;
  }

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.text();
  }

  let latestResponse: NextResponse | null = null;
  for (const targetUrl of targetUrls) {
    if (!targetUrl) {
      continue;
    }
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });

    const responseBody = await upstream.arrayBuffer();
    const responseHeaders = new Headers(upstream.headers);
    latestResponse = new NextResponse(responseBody, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
    if (!isRouteNotFoundResponse(upstream.status, responseBody)) {
      return latestResponse;
    }
  }

  return latestResponse ?? proxyErrorResponse;
}
