"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";

export function OperationsToolbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  if (pathname === "/operations/login") return null;

  const navigate = (href: string) => {
    setMenuOpen(false);
    router.push(href);
  };

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    router.replace("/operations/login");
  };

  const alertsActive = pathname.startsWith("/operations/alerts");
  const settingsActive = pathname.startsWith("/operations/settings");

  return (
    <header className="app-header operations-toolbar">
      <Link className="brand" href="/operations" aria-label="MyEscrow Operations home">
        <Image
          className="logo-mark"
          src="/myescrow-mark.svg"
          alt=""
          aria-hidden="true"
          width={64}
          height={64}
        />
        <span className="operations-brand-copy">
          <strong>MyEscrow</strong>
          <small>Operations</small>
        </span>
      </Link>

      <nav className="header-actions" aria-label="Operations toolbar">
        <button
          className="icon-btn"
          type="button"
          aria-current={alertsActive ? "page" : undefined}
          onClick={() => navigate("/operations/alerts")}
        >
          <BellIcon />
          Alerts
        </button>
        <button
          className="icon-btn"
          type="button"
          aria-current={settingsActive ? "page" : undefined}
          onClick={() => navigate("/operations/settings")}
        >
          <SettingsIcon />
          Settings
        </button>
        <button className="icon-btn operations-logout" type="button" onClick={handleLogout}>
          <LogoutIcon />
          Log out
        </button>
      </nav>

      <div className="mobile-header-actions">
        <button
          className="icon-btn mobile-alerts-btn"
          type="button"
          aria-label="Open operations alerts"
          aria-current={alertsActive ? "page" : undefined}
          onClick={() => navigate("/operations/alerts")}
        >
          <BellIcon />
          <span>Alerts</span>
        </button>
        <div className="header-menu">
          <button
            className="icon-btn header-menu-toggle"
            type="button"
            aria-label={menuOpen ? "Close operations menu" : "Open operations menu"}
            aria-expanded={menuOpen}
            aria-controls="operations-account-menu"
            onClick={() => setMenuOpen((current) => !current)}
          >
            <MenuIcon />
          </button>
          {menuOpen ? (
            <div id="operations-account-menu" className="header-menu-popover" role="menu">
              <button className="header-menu-primary" type="button" role="menuitem" onClick={() => navigate("/operations/settings")}>
                <SettingsIcon />
                Settings
              </button>
              <button className="header-menu-logout" type="button" role="menuitem" onClick={handleLogout}>
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
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
