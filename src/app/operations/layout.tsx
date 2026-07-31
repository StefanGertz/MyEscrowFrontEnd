import type { ReactNode } from "react";
import { OperationsToolbar } from "@/components/OperationsToolbar";

export default function OperationsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="operations-shell">
      <OperationsToolbar />
      {children}
    </div>
  );
}
