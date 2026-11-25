"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, ClipboardPen, Clock, CreditCard, Mail, Percent, Receipt, Sparkles, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { AiAssistantCard } from "@/components/settings/ai-assistant-card";
import { BillingSettingsCard } from "@/components/settings/billing-settings-card";
import { HourlyRateCard } from "@/components/settings/hourly-rate-card";
import { EmailTemplateCard } from "@/components/settings/email-template-card";
import { MarginModeCard } from "@/components/settings/margin-mode-card";
import { OnlinePaymentsCard } from "@/components/settings/online-payments-card";
import { PricePoliciesCard } from "@/components/settings/price-policies-card";
import {
  InvoiceReminderCard,
  QuoteReminderCard,
  QuoteTemplatesCard,
  QuoteTermsCard,
} from "@/components/settings/quote-settings-cards";
import { WageClassificationsCard } from "@/components/settings/wage-classifications-card";
import { useBillingStateQuery, type BillingState } from "@/hooks/use-billing";
import { usePublicPlansQuery } from "@/hooks/use-catalog";
import { usePricePoliciesQuery } from "@/hooks/use-price-policies";
import { ApiError, api } from "@/lib/api";
import { tenantStatusBadgeVariant, tenantStatusLabels } from "@/lib/labels";
import { formatCents } from "@/lib/money";
import { formatMoment } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { ex } from "@/lib/placeholders";

/**
 * Confirms the payment rather than telling the person to reload until something happens. The
 * webhook is still the authority for everything afterwards; this just closes the one gap where
 * a company has paid and its own space says otherwise.
 */
function PaymentReturnNotice() {
  const params = useSearchParams();
  const settled = params.get("abonnement") === "succes";
  const sessionId = params.get("session_id");
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!settled) return;
    let cancelled = false;

    async function confirm() {
      if (!sessionId) {
        setNotice("Paiement reçu. L'activation suit la confirmation de Stripe.");
        return;
      }

      setNotice("Paiement reçu. Confirmation auprès de Stripe…");
      try {
        const response = await fetch("/api/billing/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const data = await response.json().catch(() => null);
        if (cancelled) return;

        if (response.ok && data?.activated) {
          setNotice("Paiement confirmé. Votre abonnement est actif.");
          queryClient.invalidateQueries({ queryKey: ["billing-state"] });
          return;
        }

        setNotice(data?.message ?? "Stripe n'a pas encore confirmé ce paiement.");
      } catch {
        if (!cancelled) setNotice("Paiement reçu, mais la confirmation a échoué. Rechargez dans un instant.");
      }
    }

    confirm();
    return () => {
      cancelled = true;
    };
  }, [settled, sessionId, queryClient]);

  if (!notice) return null;

  return (
    <p className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
      {notice}
    </p>
  );
}

function BusinessSubscription({ state }: { state: BillingState }) {
  const isActive = state.subscriptionStatus === "Active";
  const queryClient = useQueryClient();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  /**
   * Stopping and starting again, which Stripe treats as one flag rather than two operations.
   * Nothing is taken away on the spot: the space runs to the end of the period already paid
   * for, which is why the button that undoes it says "reprendre" and not "se réabonner".
   */
  const cancel = useMutation({
    mutationFn: (stop: boolean) =>
      api.post<{ message: string }>(stop ? "billing/cancel" : "billing/resume"),
    onSuccess: (data) => {
      toast.success(data.message);
      setConfirmingCancel(false);
      queryClient.invalidateQueries({ queryKey: ["billing-state"] });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Impossible de modifier l'abonnement."),
  });

  const checkout = useMutation({
    mutationFn: () => api.post<{ checkoutUrl: string }>("billing/checkout-session"),
    onSuccess: (data) => window.location.assign(data.checkoutUrl),
    // The server already says what is wrong — no plan on the space, a key from the wrong Stripe
    // account, no permission. Replacing that with "réessayez plus tard" sends someone to retry a
    // click that will never work, and hides the one line that tells them what to fix.
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "Impossible de démarrer le paiement. Réessayez plus tard.",
      ),
  });

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="size-4" />
            Abonnement Vexta
          </CardTitle>
          <Badge variant={tenantStatusBadgeVariant[state.subscriptionStatus]}>
            {tenantStatusLabels[state.subscriptionStatus]}
          </Badge>
        </div>
        <CardDescription>
          {state.planName && state.planAmountCents !== null
            ? `${state.tenantName} · ${state.planName} — ${formatCents(state.planAmountCents, state.planCurrency ?? "CAD")} / mois`
            : state.tenantName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          {state.cancelAtPeriodEnd
            ? state.currentPeriodEnd
              ? `Abonnement résilié. Votre espace reste ouvert jusqu'au ${formatMoment(state.currentPeriodEnd)}, puis les modules de votre forfait se ferment. Vos données restent en place.`
              : "Abonnement résilié. Votre espace reste ouvert jusqu'à la fin de la période déjà payée."
            : isActive
              ? "Votre abonnement est actif."
              : state.canManage
                ? "Votre abonnement n'est pas actif. Complétez le paiement pour accéder à tous les modules."
                : "Votre abonnement n'est pas actif. Demandez à un administrateur de votre entreprise de compléter le paiement."}
        </p>

        {/* The question is asked in the card rather than in a dialog: it has one sentence of
            consequence to read, and a dialog over a card this short just hides the price and
            the date the person is weighing. */}
        {confirmingCancel && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-foreground">
            <p className="font-medium">Résilier l&apos;abonnement ?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Rien n&apos;est facturé de plus et rien ne ferme aujourd&apos;hui : votre espace
              fonctionne jusqu&apos;à la fin de la période déjà payée
              {state.currentPeriodEnd ? `, le ${formatMoment(state.currentPeriodEnd)}` : ""}. Vous
              pourrez revenir sur cette décision jusque-là.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => cancel.mutate(true)}
                disabled={cancel.isPending}
              >
                {cancel.isPending && <Spinner />}
                Oui, résilier
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmingCancel(false)}>
                Garder mon abonnement
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {state.canManage && (
        <CardFooter className="gap-2">
          {!isActive && !state.cancelAtPeriodEnd && (
            <Button onClick={() => checkout.mutate()} disabled={checkout.isPending}>
              {checkout.isPending && <Spinner />}
              Activer l&apos;abonnement
            </Button>
          )}

          {state.cancelAtPeriodEnd ? (
            <Button onClick={() => cancel.mutate(false)} disabled={cancel.isPending}>
              {cancel.isPending && <Spinner />}
              Reprendre l&apos;abonnement
            </Button>
          ) : (
            isActive &&
            !confirmingCancel && (
              <Button variant="outline" onClick={() => setConfirmingCancel(true)}>
                Se désabonner
              </Button>
            )
          )}
        </CardFooter>
      )}
    </Card>
  );
}

function PersonalSpace({ state }: { state: BillingState }) {
  const [companyName, setCompanyName] = useState("");
  const [planId, setPlanId] = useState("");
  const { data: plans, isLoading: plansLoading } = usePublicPlansQuery();

  const upgrade = useMutation({
    mutationFn: () => api.post<{ checkoutUrl: string }>("billing/upgrade", { companyName, planId }),
    onSuccess: (data) => window.location.assign(data.checkoutUrl),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Impossible de démarrer le paiement."),
  });

  const canSubmit = companyName.trim().length >= 2 && planId.length > 0 && !upgrade.isPending;

  return (
    <div className="grid max-w-lg gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="size-4" />
              Espace personnel
            </CardTitle>
            <Badge variant="outline">Gratuit</Badge>
          </div>
          <CardDescription>{state.tenantName}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Aucun abonnement, aucune carte enregistrée.
        </CardContent>
      </Card>

      {state.canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4" />
              Passer à un compte entreprise
            </CardTitle>
            <CardDescription>
              Votre espace prend le nom de l&apos;entreprise. Vos clients, projets et factures
              restent en place.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field>
              <FieldLabel htmlFor="upgrade-company">Nom de l&apos;entreprise</FieldLabel>
              <Input
                id="upgrade-company"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder={ex("Acme inc.")}
              />
            </Field>

            <Field className="mt-4">
              <FieldLabel>Forfait</FieldLabel>
              {plansLoading ? (
                <FieldDescription>Chargement des forfaits…</FieldDescription>
              ) : !plans || plans.length === 0 ? (
                <FieldDescription>
                  Aucun forfait n&apos;est offert pour le moment.
                </FieldDescription>
              ) : (
                <div role="radiogroup" aria-label="Forfait" className="space-y-2">
                  {plans.map((plan) => {
                    const selected = planId === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setPlanId(plan.id)}
                        className={cn(
                          "flex w-full items-baseline justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                          "focus-visible:ring-3 focus-visible:ring-ring/50 outline-none",
                          selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                        )}
                      >
                        <span className="text-sm font-medium text-foreground">{plan.name}</span>
                        <span className="shrink-0 text-sm tabular-nums text-foreground">
                          {formatCents(plan.amountCents, plan.currency)}
                          <span className="text-muted-foreground"> /mois</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <FieldDescription>
                Le changement ne prend effet qu&apos;une fois le paiement confirmé.
              </FieldDescription>
            </Field>
          </CardContent>
          <CardFooter>
            <Button onClick={() => upgrade.mutate()} disabled={!canSubmit}>
              {upgrade.isPending && <Spinner />}
              Continuer vers le paiement
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { data, isLoading } = useBillingStateQuery();

  // Only the owner of a company sets these: they decide what every invoice says about taxes
  // and terms, what an hour costs and what a margin means. Everyone else gets the one section
  // they can read rather than a rail of empty panels.
  const canManage = data?.kind === "Business" && data.canManage;

  // Asked for here for the badge, and skipped entirely for anyone who may not read it.
  const { data: policies } = usePricePoliciesQuery(canManage === true);

  const [section, setSection] = useState("abonnement");

  const sections: NavSection[] = [
    { key: "abonnement", label: "Abonnement", icon: CreditCard },
    ...(canManage
      ? [
          { key: "facturation", label: "Facturation", icon: Receipt },
          { key: "soumissions", label: "Soumissions", icon: ClipboardPen },
          { key: "courriel", label: "Courriel", icon: Mail },
          // Beside Facturation rather than beside Abonnement, which is the money going the
          // other way: this one is the company being paid, not the company paying Vexta.
          { key: "paiements", label: "Paiements", icon: Wallet },
          { key: "taux", label: "Taux", icon: Clock },
          // The only count that means anything on this page; the others are one thing each.
          { key: "marge", label: "Marge et prix", count: policies?.length ?? 0, icon: Percent },
          // Last, because it is the one section that is set up once and then forgotten.
          { key: "assistant", label: "Assistant IA", icon: Sparkles },
        ]
      : []),
  ];

  // Derived rather than corrected in an effect: a section that stops existing while it is open
  // falls back to the one every account has.
  const active = sections.some((item) => item.key === section) ? section : "abonnement";

  return (
    <div>
      <PageHeader
        title="Paramètres"
        description="Votre espace Vexta, son abonnement et vos règles de prix."
      />

      <Suspense fallback={null}>
        <PaymentReturnNotice />
      </Suspense>

      {isLoading || !data ? (
        <Skeleton className="h-48 max-w-lg" />
      ) : (
        /* The rail sits beside the content from md up and becomes a scrollable row below it. */
        <div className="flex flex-col gap-4 md:flex-row md:gap-6">
          {sections.length > 1 && (
            <SectionNav
              sections={sections}
              active={active}
              onSelect={setSection}
              label="Sections des paramètres"
            />
          )}

          <div className="min-w-0 flex-1">
            {active === "abonnement" &&
              (data.kind === "Personal" ? (
                <PersonalSpace state={data} />
              ) : (
                <BusinessSubscription state={data} />
              ))}
            {active === "facturation" && (
              <div className="space-y-6">
                <BillingSettingsCard />
                <InvoiceReminderCard />
              </div>
            )}
            {active === "soumissions" && (
              <div className="space-y-6">
                <QuoteTermsCard />
                <QuoteReminderCard />
                <QuoteTemplatesCard />
              </div>
            )}
            {active === "courriel" && (
              <div className="space-y-6">
                <EmailTemplateCard kind="facture" />
                <EmailTemplateCard kind="soumission" />
              </div>
            )}
            {active === "paiements" && <OnlinePaymentsCard />}
            {active === "taux" && (
              <div className="space-y-6">
                <HourlyRateCard />
                <WageClassificationsCard />
              </div>
            )}
            {active === "assistant" && <AiAssistantCard />}
            {active === "marge" && (
              <div className="space-y-6">
                <MarginModeCard />
                <PricePoliciesCard />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
