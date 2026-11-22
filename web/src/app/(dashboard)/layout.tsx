"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AppShell } from "@/components/layout/app-shell";
import { BrandTheme } from "@/components/layout/brand-theme";
import { ClientRouteGuard } from "@/components/layout/client-route-guard";
import { EmptyState } from "@/components/layout/empty-state";
import { SubscriptionGate } from "@/components/layout/subscription-gate";
import { API_UNREACHABLE_MESSAGE } from "@/lib/api-unreachable";
import { lastSignOutStatus, useAuth } from "@/lib/auth-context";

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, unreachable, refresh } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Not while the API is unreachable: being unable to ask whether someone is signed in is not
    // an answer of "no", and sending them to the sign-in page over a restart loses whatever they
    // were in the middle of for nothing.
    if (!loading && !user && !unreachable) {
      // The code travels with the redirect so the sign-in page can say why it appeared. A
      // session that ends without a word is one nobody can report, and it costs a deploy just
      // to learn which refusal was behind it.
      const reason = lastSignOutStatus ? `?session=${lastSignOutStatus}` : "?session=1";
      router.replace(`/connexion${reason}`);
    }
  }, [loading, user, unreachable, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="size-6" />
      </div>
    );
  }

  // Reached only on a cold load during an outage: once a session has been read, it is kept and
  // the pages below carry on showing what they already have.
  if (!user && unreachable) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <EmptyState
          icon={CloudOff}
          title="Service injoignable"
          description={API_UNREACHABLE_MESSAGE}
          action={<Button onClick={() => refresh()}>Réessayer</Button>}
        />
      </div>
    );
  }

  if (!user) {
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
