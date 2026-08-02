import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("direct API transport", () => {
  it("bypasses the production Next.js proxy and preserves bearer authentication", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://staging.myescrowdemo.xyz/");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { apiFetch, apiFetchDirect, setClientAuthToken } = await import("@/lib/apiClient");
    setClientAuthToken("proof-upload-token");

    await apiFetch("/api/dashboard/overview");
    await apiFetchDirect("/api/dashboard/escrows/PO-1/milestones/2/submit", {
      method: "POST",
      body: new FormData(),
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/dashboard/overview");
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://staging.myescrowdemo.xyz/api/dashboard/escrows/PO-1/milestones/2/submit",
    );
    const directInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(directInit.headers).get("Authorization")).toBe("Bearer proof-upload-token");
  });

  it("keeps mock-mode uploads on the local route", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://staging.myescrowdemo.xyz");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { apiFetchDirect } = await import("@/lib/apiClient");

    await apiFetchDirect("/api/dashboard/escrows/PO-1/milestones/2/submit", {
      method: "POST",
      body: new FormData(),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard/escrows/PO-1/milestones/2/submit",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
