const mocksEnabled = (process.env.NEXT_PUBLIC_USE_MOCKS ?? "true") !== "false";
const envAuthToken = process.env.NEXT_PUBLIC_API_TOKEN;
let runtimeAuthToken: string | null = null;

export function setClientAuthToken(token: string | null) {
  runtimeAuthToken = token;
}

const applyAuthHeaders = (init?: RequestInit) => {
  const token = runtimeAuthToken ?? envAuthToken;
  if (!token) {
    return init;
  }
  const headers = new Headers(init?.headers ?? undefined);
  headers.set("Authorization", `Bearer ${token}`);
  return {
    ...init,
    headers,
  };
};

export function apiFetch(input: string, init?: RequestInit) {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const isAbsoluteUrl = /^https?:\/\//i.test(input);
  const isInternalApiRoute = input.startsWith("/api/");
  const isTestEnv = process.env.NODE_ENV === "test";
  const shouldUseMocks = isInternalApiRoute && mocksEnabled && !isTestEnv;
  const requestInit = applyAuthHeaders(init);

  if (!baseUrl || isAbsoluteUrl || shouldUseMocks) {
    return fetch(input, requestInit);
  }

  const normalizedBase = baseUrl.replace(/\/$/, "");
  const normalizedPath = input.startsWith("/") ? input : `/${input}`;
  return fetch(`${normalizedBase}${normalizedPath}`, requestInit);
}
