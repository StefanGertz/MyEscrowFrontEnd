"use client";

import { useParams } from "next/navigation";
import { ArbitrationReportScreen } from "@/components/ArbitrationReportScreen";

export default function PartyArbitrationReportPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <ArbitrationReportScreen
      endpoint={`/api/dashboard/disputes/${encodeURIComponent(id)}/arbitration-report`}
      loginHref="/login"
      backHref="/"
      backLabel="Back to your dashboard"
      accessLabel="Party copy"
    />
  );
}
