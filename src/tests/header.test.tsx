import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Header } from "@/components/Header";

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
});
