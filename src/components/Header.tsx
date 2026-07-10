"use client";

import { useState } from "react";

type HeaderProps = {
  activeScreen?: string;
  notificationCount?: number;
  primaryLabel?: string;
  primaryDisabled?: boolean;
  onPrimaryClick?: () => void;
  onBrandClick?: () => void;
  onLogoutClick?: () => void;
  onAlertsClick?: () => void;
  onSettingsClick?: () => void;
};

export function Header({
  activeScreen,
  notificationCount = 0,
  primaryLabel = "New Escrow",
  primaryDisabled = false,
  onPrimaryClick,
  onBrandClick,
  onLogoutClick,
  onAlertsClick,
  onSettingsClick,
}: HeaderProps) {
  const menuScope = activeScreen ?? "default";
  const [openMenuScope, setOpenMenuScope] = useState<string | null>(null);
  const menuOpen = openMenuScope === menuScope;

  const runMenuAction = (action?: () => void) => {
    setOpenMenuScope(null);
    action?.();
  };

  return (
    <header className="app-header">
      <button className="brand" type="button" onClick={() => runMenuAction(onBrandClick)}>
        <img className="logo-mark" src="/myescrow-logo.png" alt="" aria-hidden="true" />
        <div className="brand-copy">
          <span>MyEscrow</span>
        </div>
      </button>

      <div className="header-actions">
        <button
          className="primary-btn"
          type="button"
          disabled={primaryDisabled}
          onClick={() => runMenuAction(onPrimaryClick)}
        >
          <SparkIcon />
          {primaryLabel}
        </button>
        <button
          className="icon-btn"
          type="button"
          data-has-notif={notificationCount > 0}
          onClick={() => runMenuAction(onAlertsClick)}
        >
          <BellIcon />
          Alerts
        </button>
        <button className="icon-btn" type="button" onClick={() => runMenuAction(onSettingsClick)}>
          <SettingsIcon />
          Settings
        </button>
        <button className="icon-btn" type="button" onClick={() => runMenuAction(onLogoutClick)}>
          <LogoutIcon />
          Log out
        </button>
      </div>

      <div className="mobile-header-actions">
        <button
          className="icon-btn mobile-alerts-btn"
          type="button"
          aria-label="Open alerts"
          data-has-notif={notificationCount > 0}
          onClick={() => runMenuAction(onAlertsClick)}
        >
          <BellIcon />
          <span>Alerts</span>
        </button>
        <div className="header-menu">
          <button
            className="icon-btn header-menu-toggle"
            type="button"
            aria-label={menuOpen ? "Close account menu" : "Open account menu"}
            aria-expanded={menuOpen}
            aria-controls="account-menu"
            onClick={() => {
              setOpenMenuScope((current) => (current === menuScope ? null : menuScope));
            }}
          >
            <MenuIcon />
          </button>
          {menuOpen ? (
            <div id="account-menu" className="header-menu-popover" role="menu">
              <button type="button" role="menuitem" onClick={() => runMenuAction(onSettingsClick)}>
                <SettingsIcon />
                Settings
              </button>
              <button type="button" role="menuitem" onClick={() => runMenuAction(onLogoutClick)}>
                <LogoutIcon />
                Log out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function MenuIcon() {
  return (
    <svg
      aria-hidden
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="m18.36 5.64-2.83 2.83" />
      <path d="m8.47 15.53-2.83 2.83" />
      <path d="m5.64 5.64 2.83 2.83" />
      <path d="m15.53 15.53 2.83 2.83" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
