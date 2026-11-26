import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, Check, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { getPublishedModules, getPublishedPlans } from "@/lib/catalog-cache";
import { moduleIcon } from "@/lib/module-icons";
import {
  comparedModules,
  discountedPrice,
  discountPeriod,
  formatPlanPrice,
  modulesIncluded,
  planSeats,
  pricePerSeat,
  trialLabel,
} from "@/lib/plan-format";
import type { PublicModule, PublicPlan } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const plan = (await getPublishedPlans().catch(() => [] as PublicPlan[])).find((p) => p.id === id);
  return plan ? { title: `Forfait ${plan.name} · Vexta`, description: plan.description ?? undefined } : {};
}

/**
 * One plan, opened from its card on the home page: what it costs, who it is for, and every
 * module and feature it includes, with what it leaves to the bigger plans.
 *
 * Pattern: marketing detail page — the same header and footer as the home page, one plan's
 * sections stacked beneath.
 */
export default function PlanPage({ params }: Params) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* The catalogue is read per request, like the home page's, never baked into the build. */}
        <Suspense fallback={<div className="min-h-[60vh]" />}>
          <PlanDetail params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}

async function PlanDetail({ params }: Params) {
  const { id } = await params;
  await connection();

  const [plans, catalogue] = await Promise.all([
    getPublishedPlans().catch(() => [] as PublicPlan[]),
    getPublishedModules().catch(() => [] as PublicModule[]),
  ]);
  const plan = plans.find((p) => p.id === id);
  if (!plan) notFound();

  const reduced = discountedPrice(plan);
  // What the other plans offer that this one does not: the honest reason to look at them.
  const missing = comparedModules(plans, catalogue).filter((m) => !plan.modules.some((own) => own.id === m.id));
  const others = plans.filter((p) => p.id !== plan.id);

  return (
    <>
      <section className="vx-glow border-b border-border">
        <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <Link
            href="/#tarif"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Tous les forfaits
          </Link>

          <div className="mt-6 grid gap-8 md:grid-cols-[1fr_20rem] md:items-start">
            <div>
              <p className="text-sm font-medium text-primary">Forfait</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {plan.name}
              </h1>
              {plan.description && (
                <p className="mt-4 max-w-2xl text-base text-muted-foreground">{plan.description}</p>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              {(plan.trialDays > 0 || reduced) && (
                <div className="mb-4 space-y-1.5 rounded-xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
                  {plan.trialDays > 0 && (
                    <p className="flex items-center gap-2">
                      <Gift className="size-4 shrink-0" />
                      {trialLabel(plan.trialDays)}, sans carte de crédit
                    </p>
                  )}
                  {reduced && (
                    <p className="flex items-center gap-2">
                      <Gift className="size-4 shrink-0" />
                      {plan.discountPercent} % de rabais {discountPeriod(plan.discountMonths)}
                    </p>
                  )}
                </div>
              )}
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-3xl font-semibold tracking-tight text-foreground">
                  {reduced ?? formatPlanPrice(plan.amountCents, plan.currency)}
                </span>
                {reduced && (
                  <span className="text-lg text-muted-foreground line-through">
                    {formatPlanPrice(plan.amountCents, plan.currency)}
                  </span>
                )}
                <span className="text-sm text-muted-foreground">/ mois</span>
              </p>
              {reduced && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Puis {formatPlanPrice(plan.amountCents, plan.currency)} / mois
                </p>
              )}

              <ul className="mt-5 space-y-2.5 border-t border-border pt-5 text-sm text-foreground">
                <Line>{planSeats(plan.minUsers, plan.maxUsers)}</Line>
                <Line>{pricePerSeat(plan)} par utilisateur à pleine capacité</Line>
                {plan.modules.length > 0 && <Line>{modulesIncluded(plan.modules.length)}</Line>}
              </ul>

              <Link
                href={`/inscription?forfait=${plan.id}`}
                className={cn(buttonVariants(), "mt-6 h-11 w-full px-6")}
              >
                Choisir ce forfait
              </Link>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Abonnement mensuel · Paiement sécurisé par Stripe
              </p>
            </div>
          </div>
        </div>
      </section>

      {plan.modules.length > 0 && (
        <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Modules inclus</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plan.modules.map((module) => {
              const Icon = moduleIcon(module.icon);
              return (
                <div key={module.id} className="rounded-xl border border-border bg-card p-5">
                  <Icon className="size-5 text-primary" />
                  <h3 className="mt-3 text-sm font-medium text-foreground">{module.title}</h3>
                  {module.description && (
                    <p className="mt-1.5 text-sm text-muted-foreground">{module.description}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {plan.features.length > 0 && (
        <section className="mx-auto w-full max-w-5xl px-4 pb-12 sm:px-6">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Fonctionnalités incluses</h2>
          <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
            {plan.features.map((feature) => {
              const Icon = moduleIcon(feature.icon);
              return (
                <li key={feature.key} className="flex items-start gap-3 px-5 py-4">
                  <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{feature.name}</p>
                    {feature.description && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{feature.description}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {missing.length > 0 && (
        <section className="mx-auto w-full max-w-5xl px-4 pb-12 sm:px-6">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Offert dans d&apos;autres forfaits</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ces modules ne font pas partie du forfait {plan.name}.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {missing.map((module) => (
              <li key={module.id} className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">
                {module.title}
              </li>
            ))}
          </ul>
        </section>
      )}

      {others.length > 0 && (
        <section className="border-t border-border bg-card/30">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-4 py-10 sm:px-6">
            <p className="mr-auto text-sm text-muted-foreground">Vous hésitez entre plusieurs forfaits ?</p>
            {others.map((other) => (
              <Link
                key={other.id}
                href={`/forfaits/${other.id}`}
                className={cn(buttonVariants({ variant: "outline" }), "h-10")}
              >
                {other.name}
              </Link>
            ))}
            <Link href="/#comparaison" className={cn(buttonVariants({ variant: "ghost" }), "h-10")}>
              Comparer les forfaits
            </Link>
          </div>
        </section>
      )}
    </>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
      {children}
    </li>
  );
}
