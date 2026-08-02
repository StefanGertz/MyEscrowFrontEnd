import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperationsToolbar } from "@/components/OperationsToolbar";

const push = vi.fn();
const replace = vi.fn();
const logout = vi.fn();
let pathname = "/operations";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, replace }),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ logout }),
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  pathname = "/operations";
  push.mockClear();
  replace.mockClear();
  logout.mockClear();
});

describe("operations toolbar", () => {
  it("keeps alerts, settings, and logout available", () => {
    render(<OperationsToolbar />);

    const toolbar = screen.getByRole("navigation", { name: "Operations toolbar" });
    fireEvent.click(within(toolbar).getByRole("button", { name: "Alerts" }));
    expect(push).toHaveBeenCalledWith("/operations/alerts");

    fireEvent.click(within(toolbar).getByRole("button", { name: "Settings" }));
    expect(push).toHaveBeenCalledWith("/operations/settings");

    fireEvent.click(within(toolbar).getByRole("button", { name: "Log out" }));
    expect(logout).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith("/operations/login");
  });

  it("uses the responsive account menu and stays off the login screen", () => {
    const { rerender } = render(<OperationsToolbar />);

    fireEvent.click(screen.getByRole("button", { name: "Open operations menu" }));
    const menu = screen.getByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Settings" }));
    expect(push).toHaveBeenCalledWith("/operations/settings");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    pathname = "/operations/login";
    rerender(<OperationsToolbar />);
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });
});
