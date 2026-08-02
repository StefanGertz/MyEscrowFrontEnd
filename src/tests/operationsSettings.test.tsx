import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OperationsSettingsPage from "@/app/operations/settings/page";

const replace = vi.fn();
const logout = vi.fn();
const apiFetch = vi.fn();
let role: "customer" | "support" | "admin" = "admin";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "operator-1", name: "Operations Admin", email: "admin@example.com", role },
    isAuthenticated: true,
    isHydrating: false,
    logout,
  }),
}));

vi.mock("@/lib/apiClient", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

vi.mock("@/components/ChangePasswordModal", () => ({
  ChangePasswordModal: () => <div role="dialog">Operator password dialog</div>,
}));

afterEach(cleanup);

beforeEach(() => {
  role = "admin";
  replace.mockClear();
  logout.mockClear();
  apiFetch.mockReset();
  apiFetch.mockResolvedValue(new Response(JSON.stringify({ currentRole: "admin" }), { status: 200 }));
});

describe("operations settings boundary", () => {
  it("shows only operator identity and security settings", async () => {
    render(<OperationsSettingsPage />);

    expect(await screen.findByText("Operations Admin")).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText(/Customer profile, wallet, payout, and bank-account settings are not available/)).toBeInTheDocument();
    expect(screen.queryByText("New escrow")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Operator password dialog");
  });

  it("rejects a customer session before loading settings", async () => {
    role = "customer";
    render(<OperationsSettingsPage />);

    await waitFor(() => expect(logout).toHaveBeenCalledOnce());
    expect(replace).toHaveBeenCalledWith("/operations/login");
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
