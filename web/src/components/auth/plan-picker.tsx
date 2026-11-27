"use client";

import { Check, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PublicPlan } from "@/lib/types";
import {
  discountedPrice,
  discountPeriod,
  formatPlanPrice,
  modulesIncluded,
  planSeats,
  trialLabel,
} from "@/lib/plan-format";

/**
 * The plans in full at signup, one selectable card each: price, offer, seats, modules and the
 * features, so the choice is made here rather than by going back to the pricing page.
 */
export function PlanPicker({
  plans,
  value,
  onChange,
  invalid,
}: {
  plans: PublicPlan[];
  value: string;
  onChange: (planId: string) => void;
  invalid?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Forfait"
      aria-invalid={invalid}
      className={cn(
        "grid gap-4",
        plans.length === 2 && "sm:grid-cols-2",
        plans.length >= 3 && "md:grid-cols-3",
      )}
    >
      {plans.map((plan) => {
        const selected = value === plan.id;
        const reduced = discountedPrice(plan);
        return (
          <button
            key={plan.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(plan.id)}
            className={cn(
              "relative flex flex-col rounded-xl border p-5 text-left transition-colors outline-none",
              "focus-visible:ring-3 focus-visible:ring-ring/50",
              selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/40",
            )}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="text-base font-semibold text-foreground">{plan.name}</span>
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                  selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {selected && <Check className="size-3.5" />}
              </span>
            </span>

            {reduced ? (
              <span className="mt-2 block">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-2xl font-semibold tracking-tight text-foreground">{reduced}</span>
                  <span className="text-sm text-muted-foreground line-through">
                    {formatPlanPrice(plan.amountCents, plan.currency)}
                  </span>
                  <span className="text-sm text-muted-foreground">/ mois</span>
                </span>
                <span className="mt-0.5 block text-xs font-medium text-primary">
                  {plan.discountPercent} % de rabais {discountPeriod(plan.discountMonths)}, puis{" "}
                  {formatPlanPrice(plan.amountCents, plan.currency)} / mois
                </span>
              </span>
            ) : (
              <span className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-semibold tracking-tight text-foreground">
                  {formatPlanPrice(plan.amountCents, plan.currency)}
                </span>
                <span className="text-sm text-muted-foreground">/ mois</span>
              </span>
            )}

            {plan.trialDays > 0 && (
              <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                <Gift className="size-3.5" />
                {trialLabel(plan.trialDays)}, sans carte de crédit
              </span>
            )}

            {plan.description && <span className="mt-3 block text-sm text-muted-foreground">{plan.description}</span>}

            <ul className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              <PlanLine>{planSeats(plan.minUsers, plan.maxUsers)}</PlanLine>
              {plan.modules.length > 0 && <PlanLine>{modulesIncluded(plan.modules.length)}</PlanLine>}
              {plan.features.map((feature) => (
                <PlanLine key={feature.key}>{feature.name}</PlanLine>
              ))}
            </ul>
          </button>
        );
      })}
    </div>
  );
}

function PlanLine({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-foreground">
      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>{children}</span>
    </li>
  );
}
