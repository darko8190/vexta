import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  comparedFeatures,
  comparedModules,
  discountedPrice,
  discountPeriod,
  formatPlanPrice,
  highlightedPlanId,
  pricePerSeat,
} from "@/lib/plan-format";
import type { PublicModule, PublicPlan } from "@/lib/types";

/**
 * Every plan against every module and feature any of them offers. Nothing here is typed by
 * hand: the rows come from the plans themselves, so changing what a plan includes in the admin
 * changes the table.
 */
export function PlanComparison({ plans, catalogue }: { plans: PublicPlan[]; catalogue: PublicModule[] }) {
  if (plans.length < 2) return null;

  const modules = comparedModules(plans, catalogue);
  const features = comparedFeatures(plans);
  const highlighted = highlightedPlanId(plans);
  const anyTrial = plans.some((plan) => plan.trialDays > 0);
  const anyDiscount = plans.some((plan) => discountedPrice(plan) != null);

  return (
    <div id="comparaison" className="vx-reveal mx-auto mt-20 max-w-5xl scroll-mt-20">
      <h3 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        Comparaison des forfaits
      </h3>

      {/* The table scrolls inside its frame on a phone, never the page. */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="sticky left-0 bg-card px-4 py-3 text-left font-medium text-muted-foreground">
                Fonctionnalités
              </th>
              {plans.map((plan) => (
                <th
                  key={plan.id}
                  scope="col"
                  className={cn(
                    "px-4 py-3 text-center font-semibold text-foreground",
                    plan.id === highlighted && "bg-primary/5",
                  )}
                >
                  <Link href={`/forfaits/${plan.id}`} className="hover:text-primary hover:underline">
                    {plan.name}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Prix mensuel" plans={plans} highlighted={highlighted}>
              {(plan) => formatPlanPrice(plan.amountCents, plan.currency)}
            </Row>
            <Row label="Utilisateurs" plans={plans} highlighted={highlighted}>
              {(plan) => (plan.minUsers > 1 ? `${plan.minUsers} à ${plan.maxUsers}` : plan.maxUsers)}
            </Row>
            <Row label="Prix par utilisateur à pleine capacité" plans={plans} highlighted={highlighted}>
              {(plan) => pricePerSeat(plan)}
            </Row>
            {anyTrial && (
              <Row label="Essai gratuit" plans={plans} highlighted={highlighted}>
                {(plan) =>
                  plan.trialDays > 0 ? (
                    <span className="font-medium text-primary">
                      {plan.trialDays === 1 ? "1 jour" : `${plan.trialDays} jours`}
                    </span>
                  ) : (
                    <No />
                  )
                }
              </Row>
            )}

            {anyDiscount && (
              <Row label="Rabais de bienvenue" plans={plans} highlighted={highlighted}>
                {(plan) =>
                  discountedPrice(plan) ? (
                    <span className="font-medium text-primary">
                      −{plan.discountPercent} % {discountPeriod(plan.discountMonths)}
                    </span>
                  ) : (
                    <No />
                  )
                }
              </Row>
            )}

            {modules.length > 0 && <Group label="Modules" span={plans.length + 1} />}
            {modules.map((module) => (
              <Row key={module.id} label={module.title} plans={plans} highlighted={highlighted}>
                {(plan) => (plan.modules.some((m) => m.id === module.id) ? <Yes /> : <No />)}
              </Row>
            ))}

            {features.length > 0 && <Group label="Fonctionnalités" span={plans.length + 1} />}
            {features.map((feature) => (
              <Row key={feature.key} label={feature.name} plans={plans} highlighted={highlighted}>
                {(plan) => (plan.features.some((f) => f.key === feature.key) ? <Yes /> : <No />)}
              </Row>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  label,
  plans,
  highlighted,
  children,
}: {
  label: string;
  plans: PublicPlan[];
  highlighted: string | null;
  children: (plan: PublicPlan) => React.ReactNode;
}) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <th scope="row" className="sticky left-0 bg-card px-4 py-3 text-left font-normal text-foreground">
        {label}
      </th>
      {plans.map((plan) => (
        <td
          key={plan.id}
          className={cn("px-4 py-3 text-center tabular-nums text-foreground", plan.id === highlighted && "bg-primary/5")}
        >
          {children(plan)}
        </td>
      ))}
    </tr>
  );
}

function Group({ label, span }: { label: string; span: number }) {
  return (
    <tr className="border-b border-border bg-muted/40">
      <th scope="colgroup" colSpan={span} className="px-4 py-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </th>
    </tr>
  );
}

function Yes() {
  return (
    <>
      <Check className="mx-auto size-4 text-primary" aria-hidden />
      <span className="sr-only">Inclus</span>
    </>
  );
}

function No() {
  return (
    <>
      <Minus className="mx-auto size-4 text-muted-foreground/60" aria-hidden />
      <span className="sr-only">Non inclus</span>
    </>
  );
}
