import type { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
  screenId?: string;
};

export function AppShell({ children, screenId }: AppShellProps) {
  return (
    <div className="app" data-screen={screenId}>
      {children}
    </div>
  );
}
