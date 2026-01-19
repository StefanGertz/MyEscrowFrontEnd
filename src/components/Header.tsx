type HeaderProps = {
  notificationCount?: number;
  primaryLabel?: string;
  primaryDisabled?: boolean;
  onPrimaryClick?: () => void;
  onBrandClick?: () => void;
};

export function Header({
  notificationCount = 0,
  primaryLabel = "New Escrow",
  primaryDisabled = false,
  onPrimaryClick,
  onBrandClick,
}: HeaderProps) {
  return (
    <header className="app-header">
      <button className="brand" type="button" onClick={onBrandClick}>
        <span aria-hidden className="logo-mark">
          ME
        </span>
        <div className="brand-copy">
          <span>MyEscrow</span>
        </div>
      </button>

      <div className="header-actions">
        <button className="icon-btn" type="button">
          <SupportIcon />
          Support
        </button>
        <button
          className="icon-btn"
          type="button"
          data-has-notif={notificationCount > 0}
        >
          <BellIcon />
          Alerts
        </button>
        <button
          className="primary-btn"
          type="button"
          disabled={primaryDisabled}
          onClick={onPrimaryClick}
        >
          <SparkIcon />
          {primaryLabel}
        </button>
      </div>
    </header>
  );
}

function SupportIcon() {
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
      <path d="M18 19a4 4 0 0 0 4-4v-2a8 8 0 1 0-16 0v2a4 4 0 0 0 4 4" />
      <path d="M8 21h8" />
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
