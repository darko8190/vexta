"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useBillingStateQuery } from "@/hooks/use-billing";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

/**
 * The client-side half of RequireActiveSubscription. The API answers 402 for every module of a
 * company that has not paid, and nothing read that status: each page sat on a skeleton forever,
 * because a failed query leaves isLoading false and the data undefined. Eight modules, eight
 * frozen screens, no explanation anywhere.
 *
 * The rule is mirrored here once rather than handled eight times, and it has to match the
 * server's exactly — a personal space is free, and a super admin inside a tenant passes, so that
 * a space that has stopped paying stays inspectable.
 */
export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const isTenantMember = Boolean(user) && (user!.role !== "SuperAdmin" || user!.isImpersonating);

  // Nothing to ask for when there is no company to bill. A super admin outside a tenant got a
  // 404 on every page load, and `exempt` is already true for them, so the answer was unused.
  const { data } = useBillingStateQuery(isTenantMember);

  // Settings is where the payment is made, so it is never behind the wall. Nor is the super
  // admin's own area, which has no tenant to bill.
  const exempt = !isTenantMember || user!.isImpersonating || pathname.startsWith("/parametres")
    // An unpaid company still has people in it, and one of them may need their password back.
    || pathname.startsWith("/profil");

  // While the state is unknown, the app stays as it is: a wall that flashes on every page load
  // would be worse than the one page of skeleton it replaces.
  // A trial passes, and it has to: the API lets it through, so a wall here would lock a
  // company out of a space the server is perfectly willing to serve — with no way to tell from
  // the screen that the two disagree. Checked against the days left rather than the status
  // alone, because nothing sweeps expired trials and the row still reads Trialing afterwards.
  const trialing = data?.subscriptionStatus === "Trialing" && (data.trialDaysLeft ?? 0) > 0;

  if (exempt || !data || data.kind === "Personal" || data.subscriptionStatus === "Active" || trialing) {
    return children;
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="size-4" />
          Abonnement requis
        </CardTitle>
        <CardDescription>{data.tenantName}</CardDescription>
      </CardHeader>

      <CardContent className="text-sm text-muted-foreground">
        {data.canManage
          ? "Les modules sont fermés tant que l'abonnement n'est pas actif. Complétez le paiement pour les rouvrir."
          : "Les modules sont fermés tant que l'abonnement n'est pas actif. Demandez à un administrateur de votre entreprise de compléter le paiement."}
      </CardContent>

      <CardFooter>
        {/* A styled link, not a Button rendering one: Base UI drops native button semantics when
            its render target is not a <button>, and this is a navigation. */}
        <Link href="/parametres" className={cn(buttonVariants())}>
          {data.canManage ? "Aller à l'abonnement" : "Voir les paramètres"}
        </Link>
      </CardFooter>
    </Card>
  );
}
