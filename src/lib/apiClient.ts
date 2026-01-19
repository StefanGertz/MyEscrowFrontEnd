export function apiFetch(input: string, init?: RequestInit) {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const url = baseUrl
    ? `${baseUrl.replace(/\/$/, "")}${input.startsWith("/") ? input : `/${input}`}`
    : input;
  return fetch(url, init);
}
