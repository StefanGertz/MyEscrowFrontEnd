"use client";

import { useParams } from "next/navigation";
import { ArbitrationReportScreen } from "@/components/ArbitrationReportScreen";

export default function OperationsDisputePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <ArbitrationReportScreen
      endpoint={`/api/operations/disputes/${encodeURIComponent(id)}/arbitration-report`}
      loginHref="/operations/login"
      backHref="/operations/alerts"
      backLabel="Back to operations alerts"
      accessLabel="Authorized operations record"
    />
  );
}
