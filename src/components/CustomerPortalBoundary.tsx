"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";

export function CustomerPortalBoundary({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const router = useRouter();
  const { user, isHydrating } = useAuth();
  const isOperator = user?.role === "support" || user?.role === "admin";

  useEffect(() => {
    if (!isHydrating && isOperator) {
      router.replace("/operations");
    }
  }, [isHydrating, isOperator, router]);

  if (isHydrating || isOperator) return fallback;
  return children;
}
