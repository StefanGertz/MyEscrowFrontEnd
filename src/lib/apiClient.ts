export function apiFetch(input: string, init?: RequestInit) {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const isAbsoluteUrl = /^https?:\/\//i.test(input);
  const isInternalApiRoute = input.startsWith("/api/");
  const isTestEnv = process.env.NODE_ENV === "test";
  if (!baseUrl || isAbsoluteUrl || (isInternalApiRoute && !isTestEnv)) {
    return fetch(input, init);
  }
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const normalizedPath = input.startsWith("/") ? input : `/${input}`;
  return fetch(`${normalizedBase}${normalizedPath}`, init);
}
