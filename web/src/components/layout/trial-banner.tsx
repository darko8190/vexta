"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useBillingStateQuery } from "@/hooks/use-billing";
import { useAuth } from "@/lib/auth-context";
import { formatDateOnly } from "@/lib/dates";

/**
 * The line across the top of a company inside its free trial.
 *
 * Everyone who works there sees the countdown, because everyone loses the space when it runs
 * out; only whoever handles the money gets the button, since the others would land on a screen
 * that refuses them. There is no dismiss: a trial ending is not a notice somebody should be
 * able to put away and then be surprised by.
 */
export function TrialBanner() {
  const { user } = useAuth();

  // A company's own trial, and nobody else's. A personal space is free and has none, a customer
  // does not pay for anything, and a super admin outside a tenant has no space to bill — in
  // each case the endpoint answers 404, which would be a failed request on every page load.
  const eligible =
    Boolean(user) &&
    user!.role !== "Client" &&
    user!.tenantKind !== "Personal" &&
    (user!.role !== "SuperAdmin" || user!.isImpersonating);

  const { data } = useBillingStateQuery(eligible);

  if (!eligible || data?.subscriptionStatus !== "Trialing") return null;

  const days = data.trialDaysLeft ?? 0;
  const over = days <= 0;

  return (
    <div
      className={
        over
          ? "flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 md:px-6"
          : "flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary/30 bg-primary/10 px-4 py-2 md:px-6"
      }
    >
      <Clock className={over ? "size-4 shrink-0 text-destructive" : "size-4 shrink-0 text-primary"} />

      <p className="text-sm text-foreground">
        {over ? (
          <>
            Votre essai gratuit est <span className="font-medium">terminé</span>. Abonnez-vous
            pour retrouver vos onglets.
          </>
        ) : (
          <>
            Essai gratuit :{" "}
            <span className="font-medium">
              {days === 1 ? "il reste 1 jour" : `il reste ${days} jours`}
            </span>
            {data.trialEndsAt && <> — jusqu&apos;au {formatDateOnly(data.trialEndsAt)}</>}.
          </>
        )}
      </p>

      {/* Straight to Paramètres, where the subscribe button already lives. A second way to pay,
          wired from a banner, is a second thing to keep working. */}
      {data.canManage && (
        <Link
          href="/parametres"
          className={buttonVariants({ variant: over ? "default" : "outline", size: "sm" }) + " ml-auto"}
        >
          Payer l&apos;abonnement
        </Link>
      )}
    </div>
  );
}
