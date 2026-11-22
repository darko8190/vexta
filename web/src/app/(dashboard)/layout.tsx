"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { AppShell } from "@/components/layout/app-shell";
import { BrandTheme } from "@/components/layout/brand-theme";
import { ClientRouteGuard } from "@/components/layout/client-route-guard";
import { SubscriptionGate } from "@/components/layout/subscription-gate";
import { useAuth } from "@/lib/auth-context";

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/connexion");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <>
      {/* Before the shell, so the company's colour is in place for the first frame it draws. */}
      <BrandTheme color={user.tenantBrandColor} />
      <AppShell>
        <SubscriptionGate>
          <ClientRouteGuard>{children}</ClientRouteGuard>
        </SubscriptionGate>
      </AppShell>
    </>
  );
}
