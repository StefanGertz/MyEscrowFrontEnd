import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AuthProvider, useAuth } from "@/components/AuthProvider";
import { isSessionExpired, resolveSessionExpiresAt } from "@/lib/sessionExpiry";

const SessionStatus = () => {
  const { isAuthenticated } = useAuth();
  return <div>{isAuthenticated ? "authenticated" : "signed out"}</div>;
};

const renderSession = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SessionStatus />
      </AuthProvider>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("session expiry", () => {
  it("recognizes expired and active sessions", () => {
    const now = Date.now();
    expect(isSessionExpired(new Date(now - 1).toISOString(), now)).toBe(true);
    expect(isSessionExpired(resolveSessionExpiresAt(undefined, now), now)).toBe(false);
  });

  it("automatically signs out when the stored session expires", async () => {
    window.sessionStorage.setItem(
      "myescrow.auth",
      JSON.stringify({
        token: "test-token",
        expiresAt: new Date(Date.now() + 250).toISOString(),
        user: { id: "user-1", name: "Stefan Gertz", email: "stefan@example.com" },
      }),
    );

    renderSession();

    await waitFor(() => expect(screen.getByText("authenticated")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("signed out")).toBeTruthy(), { timeout: 1_000 });
    expect(window.sessionStorage.getItem("myescrow.auth")).toBeNull();
  });

  it("does not restore a durable session from a previous browser session", async () => {
    window.localStorage.setItem(
      "myescrow.auth",
      JSON.stringify({
        token: "legacy-token",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        user: { id: "user-1", name: "Stefan Gertz", email: "stefan@example.com" },
      }),
    );

    const view = renderSession();

    await waitFor(() => expect(view.getByText("signed out")).toBeTruthy());
    expect(window.localStorage.getItem("myescrow.auth")).toBeNull();
    expect(window.sessionStorage.getItem("myescrow.auth")).toBeNull();
  });
});
