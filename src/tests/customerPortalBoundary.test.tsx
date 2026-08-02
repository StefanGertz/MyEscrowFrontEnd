import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerPortalBoundary } from "@/components/CustomerPortalBoundary";

const replace = vi.fn();
let role: "customer" | "support" | "admin" = "customer";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "user-1", name: "Portal User", email: "portal@example.com", role },
    isHydrating: false,
  }),
}));

afterEach(cleanup);

beforeEach(() => {
  role = "customer";
  replace.mockClear();
});

describe("customer portal boundary", () => {
  it("renders the customer app for customer sessions", () => {
    render(<CustomerPortalBoundary fallback={<p>Redirecting</p>}><p>Customer app</p></CustomerPortalBoundary>);
    expect(screen.getByText("Customer app")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it.each(["support", "admin"] as const)("redirects a %s session to Operations before rendering customer content", async (operatorRole) => {
    role = operatorRole;
    render(<CustomerPortalBoundary fallback={<p>Redirecting</p>}><p>Customer app</p></CustomerPortalBoundary>);

    expect(screen.queryByText("Customer app")).not.toBeInTheDocument();
    expect(screen.getByText("Redirecting")).toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/operations"));
  });
});
