import Link from "next/link";
import { Check, Gift, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  bestOffers,
  discountedPrice,
  discountPeriod,
  formatPlanPrice,
  highlightedPlanId,
  modulesIncluded,
  planSeats,
  trialLabel,
} from "@/lib/plan-format";

/**
 * The offers on the table, said once above the plans: a free trial or a discount is a reason to
 * sign up today, and a visitor who only sees it on one card may never reach that card.
 */
export function PlanOffers({ plans }: { plans: PublicPlan[] }) {
  const offers = bestOffers(plans);
  if (!offers) return null;

  return (
    <div className="vx-reveal mt-6 flex flex-wrap justify-center gap-2">
      {offers.trial > 0 && (
        <OfferPill icon={Gift}>
          {plans.length > 1 ? "Jusqu'à " : ""}
          {offers.trial === 1 ? "1 jour" : `${offers.trial} jours`} d&apos;essai gratuit, sans carte de crédit
        </OfferPill>
      )}
      {offers.percent > 0 && (
        <OfferPill icon={Tag}>
          {plans.length > 1 ? "Jusqu'à " : ""}
          {offers.percent} % de rabais sur vos premiers mois
        </OfferPill>
      )}
    </div>
  );
}

function OfferPill({ icon: Icon, children }: { icon: typeof Gift; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
      <Icon className="size-4" />
      {children}
    </span>
  );
}
import type { PublicPlan } from "@/lib/types";

/**
 * The plans side by side. Each card opens the plan's own page; the button goes straight to
 * signup for the visitor who has already decided.
 */
export function PlanCards({ plans }: { plans: PublicPlan[] }) {
  const highlighted = highlightedPlanId(plans);

  return (
    <div
      className={cn(
        "mx-auto mt-12 grid gap-6",
        plans.length === 1 && "max-w-md",
        plans.length === 2 && "max-w-3xl sm:grid-cols-2",
        plans.length >= 3 && "lg:grid-cols-3",
      )}
    >
      {plans.map((plan) => (
        <PlanCard key={plan.id} plan={plan} highlighted={plan.id === highlighted} />
      ))}
    </div>
  );
}

function PlanCard({ plan, highlighted }: { plan: PublicPlan; highlighted: boolean }) {
  const reduced = discountedPrice(plan);
  const offers = [
    plan.trialDays > 0 ? (plan.trialDays === 1 ? "1 jour gratuit" : `${plan.trialDays} jours gratuits`) : null,
    reduced ? `−${plan.discountPercent} %` : null,
  ].filter(Boolean);

  return (
    <div
      className={cn(
        "vx-reveal vx-lift relative flex flex-col rounded-2xl border bg-card p-6 sm:p-8",
        highlighted ? "border-primary ring-1 ring-primary" : "border-border",
      )}
    >
      {/* The name is the card's link, stretched over the whole card; the signup button sits
          above it (z-10), so it stays its own target. */}
      <h3 className="text-base font-semibold text-foreground">
        <Link
          href={`/forfaits/${plan.id}`}
          className="rounded-sm after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {plan.name}
        </Link>
      </h3>
      {/* The offer rides on the card's top edge, where it is read before the price. */}
      {offers.length > 0 && (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm sm:left-8">
          <Gift className="size-3.5" />
          {offers.join(" · ")}
        </span>
      )}
      {reduced ? (
        <>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-3xl font-semibold tracking-tight text-foreground">{reduced}</span>
            <span className="text-lg text-muted-foreground line-through">
              {formatPlanPrice(plan.amountCents, plan.currency)}
            </span>
            <span className="text-sm text-muted-foreground">/ mois</span>
          </p>
          <p className="mt-1 text-sm font-medium text-primary">
            {plan.discountPercent} % de rabais {discountPeriod(plan.discountMonths)}, puis{" "}
            {formatPlanPrice(plan.amountCents, plan.currency)} / mois
          </p>
        </>
      ) : (
        <p className="mt-3 flex items-baseline gap-1">
          <span className="text-3xl font-semibold tracking-tight text-foreground">
            {formatPlanPrice(plan.amountCents, plan.currency)}
          </span>
          <span className="text-sm text-muted-foreground">/ mois</span>
        </p>
      )}
      {plan.trialDays > 0 && (
        <p className="mt-1 text-sm font-medium text-primary">
          {trialLabel(plan.trialDays)}, sans carte de crédit
        </p>
      )}
      {plan.description && <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>}

      <ul className="mt-6 space-y-3 border-t border-border pt-6">
        {/* The seat count is the line that decides for a team, so it leads the list. */}
        <PlanLine>{planSeats(plan.minUsers, plan.maxUsers)}</PlanLine>
        {plan.modules.length > 0 && <PlanLine>{modulesIncluded(plan.modules.length)}</PlanLine>}
        {plan.features.map((feature) => (
          <PlanLine key={feature.key}>{feature.name}</PlanLine>
        ))}
      </ul>

      {/* mt-auto on the wrapper, not the button: it lines the buttons up across cards of
          unequal height, and padding keeps a gap when a card is short. */}
      <div className="relative z-10 mt-auto space-y-2 pt-8">
        <Link href={`/inscription?forfait=${plan.id}`} className={cn(buttonVariants(), "h-11 w-full px-6")}>
          Choisir ce forfait
        </Link>
        <Link
          href={`/forfaits/${plan.id}`}
          className={cn(buttonVariants({ variant: "ghost" }), "h-9 w-full text-muted-foreground")}
          tabIndex={-1}
        >
          Voir les détails
        </Link>
      </div>
    </div>
  );
}

function PlanLine({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-sm text-foreground">
      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
      {children}
    </li>
  );
}
