import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Header } from "@/components/Header";

afterEach(() => {
  cleanup();
});

describe("mobile header menu", () => {
  it("keeps alerts visible and moves account actions into the menu", () => {
    const onAlertsClick = vi.fn();
    const onSettingsClick = vi.fn();
    const onLogoutClick = vi.fn();

    render(
      <Header
        onAlertsClick={onAlertsClick}
        onSettingsClick={onSettingsClick}
        onLogoutClick={onLogoutClick}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open alerts" }));
    expect(onAlertsClick).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    const menu = screen.getByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Settings" }));
    expect(onSettingsClick).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Log out" }));
    expect(onLogoutClick).toHaveBeenCalledOnce();
  });

  it("closes the account menu when the active screen changes", () => {
    const { rerender } = render(<Header activeScreen="dashboard" />);

    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    rerender(<Header activeScreen="wallet" />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("can hide the alerts badge while alerts still exist", () => {
    render(<Header notificationCount={3} hasUnreadNotifications={false} />);

    expect(screen.getByRole("button", { name: "Open alerts" })).toHaveAttribute("data-has-notif", "false");
  });
});
