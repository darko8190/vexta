"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, ClipboardPen, Clock, Compass, CreditCard, Globe, KeyRound, Mail, Percent, Receipt, Sparkles, Trash2, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/layout/page-header";
import { InvoiceAutoFeesCard } from "@/components/settings/invoice-auto-fees-card";
import { QuoteResponsesCard } from "@/components/settings/quote-responses-card";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { AiAssistantCard } from "@/components/settings/ai-assistant-card";
import { BillingSettingsCard } from "@/components/settings/billing-settings-card";
import { HourlyRateCard } from "@/components/settings/hourly-rate-card";
import { EmailTemplateCard } from "@/components/settings/email-template-card";
import { MarginModeCard } from "@/components/settings/margin-mode-card";
import { OnlinePaymentsCard } from "@/components/settings/online-payments-card";
import { PayPalCard, usePayPalStateQuery } from "@/components/settings/paypal-card";
import { PricePoliciesCard } from "@/components/settings/price-policies-card";
import {
  InvoiceReminderCard,
  QuoteReminderCard,
  QuoteTermsCard,
} from "@/components/settings/quote-settings-cards";
import { WageClassificationsCard } from "@/components/settings/wage-classifications-card";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { McpKeysCard } from "@/components/settings/mcp-keys-card";
import { CompanySettings, PublicPageSettings } from "@/components/company/company-settings";
import { TrashCard } from "@/components/settings/trash-card";
import { useBillingSettingsQuery } from "@/hooks/use-billing-settings";
import { useInvoiceAutoFeesQuery } from "@/hooks/use-auto-fees";
import { usePricePoliciesQuery } from "@/hooks/use-price-policies";
import { useOnlinePaymentsQuery } from "@/hooks/use-online-payments";
import { useAiSettingsQuery } from "@/hooks/use-assistant";
import { useWageClassificationsQuery } from "@/hooks/use-wage-classifications";
import { useBillingStateQuery, type BillingState } from "@/hooks/use-billing";
import { usePublicPlansQuery } from "@/hooks/use-catalog";
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

  // Read here only to say, on each section, whether it is set up. The cards read the same
  // queries, so this costs no request of its own.
  const { data: billing } = useBillingSettingsQuery(canManage === true);
  const { data: payments } = useOnlinePaymentsQuery(canManage === true);
  const { data: paypal } = usePayPalStateQuery(canManage === true);
  const { data: ai } = useAiSettingsQuery(canManage === true);
  const { data: classifications } = useWageClassificationsQuery(canManage === true);
  const { data: autoFees } = useInvoiceAutoFeesQuery(canManage === true);
  const { data: pricePolicies } = usePricePoliciesQuery(canManage === true);
  // Same key as the Corbeille card, so opening it costs nothing more.
  const { data: trash } = useQuery({
    queryKey: ["corbeille"],
    queryFn: () => api.get<unknown[]>("corbeille"),
    enabled: canManage === true,
  });

  type Progress = { done: number; total: number } | undefined;
  /** One part: set up or not, unknown while its query is in flight. */
  const done = (configured: boolean | undefined): Progress =>
    configured === undefined ? undefined : { done: configured ? 1 : 0, total: 1 };
  /** Several parts added up into « 1/2 ». Unknown until every part is known. */
  const all = (...parts: Progress[]): Progress =>
    parts.some((p) => p === undefined)
      ? undefined
      : parts.reduce<{ done: number; total: number }>((sum, p) => ({ done: sum.done + p!.done, total: sum.total + p!.total }), { done: 0, total: 0 });

  const billingStatus = done(billing?.configured);
  const quoteTermsStatus = done(billing ? Boolean(billing.quoteTerms?.trim()) : undefined);
  const quoteReminderStatus = done(billing ? billing.quoteReminderDays != null : undefined);
  const invoiceReminderStatus = done(billing ? billing.invoiceReminderDays != null : undefined);
  const invoiceEmailStatus = done(billing ? Boolean(billing.invoiceEmailBody || billing.invoiceEmailSubject) : undefined);
  const quoteEmailStatus = done(billing ? Boolean(billing.quoteEmailBody || billing.quoteEmailSubject) : undefined);
  const hourlyStatus = done(billing ? billing.defaultHourlyRate != null : undefined);
  const classificationsStatus = done(classifications ? classifications.length > 0 : undefined);
  const stripeStatus = payments && payments.included ? done(payments.chargesEnabled) : undefined;
  const paypalStatus = paypal && paypal.included ? done(paypal.connected) : undefined;
  const paymentParts = [stripeStatus, paypalStatus].filter((part) => part !== undefined);
  const paymentsStatus = paymentParts.length > 0 ? all(...paymentParts) : undefined;
  // Each answer a customer can give from the e-mail is one part: three of three while all are
  // offered, fewer once some are turned off.
  const quoteResponsesStatus: Progress = billing
    ? {
        done: [billing.quoteEmailCanApprove, billing.quoteEmailCanRequestChange, billing.quoteEmailCanRefuse].filter(
          (offered) => offered ?? true,
        ).length,
        total: 3,
      }
    : undefined;
  // Not chosen until the company picks one itself, whatever the default prices with meanwhile.
  const marginModeStatus = done(billing ? billing.marginModeChosen === true : undefined);

  // ?section=entreprise from the old Fiche entreprise links. Read once; the server render shows
  // the skeleton either way, so the first client render cannot disagree with it.
  const [section, setSection] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("section"),
  );

  const sections: NavSection[] = [
    // First: the company's own card, the page every other setting is about.
    ...(canManage
      ? [
          { key: "entreprise", label: "Entreprise", icon: Building2 },
          { key: "page-publique", label: "Page publique", icon: Globe },
        ]
      : []),
    { key: "abonnement", label: "Abonnement", icon: CreditCard },
    ...(canManage
      ? [
          { key: "facturation", label: "Facturation", icon: Receipt, status: all(billingStatus, invoiceReminderStatus) },
          { key: "soumissions", label: "Soumissions", icon: ClipboardPen, status: all(quoteTermsStatus, quoteReminderStatus, quoteResponsesStatus) },
          // The built-in messages work; the section is "done" once either has been made the
          // company's own.
          { key: "courriel", label: "Courriel", icon: Mail, status: all(invoiceEmailStatus, quoteEmailStatus) },
          // Beside Facturation rather than beside Abonnement, which is the money going the
          // other way: this one is the company being paid, not the company paying Vexta.
          {
            key: "paiements",
            label: "Paiements",
            icon: Wallet,
            // Only what the plan offers counts: there is nothing to set up otherwise.
            status: paymentsStatus,
          },
          { key: "taux", label: "Taux", icon: Clock, status: all(hourlyStatus, classificationsStatus) },
          { key: "marge", label: "Marge et prix", icon: Percent, status: marginModeStatus },
          // Last, because it is the one section that is set up once and then forgotten.
          {
            key: "assistant",
            label: "Assistant IA",
            icon: Sparkles,
            status: ai && ai.featureIncluded ? done(ai.hasApiKey && ai.isEnabled) : undefined,
          },
          { key: "integrations", label: "Intégrations", icon: KeyRound },
          // Last: what was deleted, to look at again, restore or erase for good.
          { key: "corbeille", label: "Corbeille", icon: Trash2, count: trash?.length ?? 0 },
        ]
      : []),
  ];

  // Derived rather than corrected in an effect: a section that stops existing while it is open
  // falls back to the one every account has.
  const fallback = canManage ? "entreprise" : "abonnement";
  const active = section && sections.some((item) => item.key === section) ? section : fallback;

  return (
    <div>
      <PageHeader
        title="Paramètres"
        description="Votre entreprise, son abonnement et vos règles de travail."
        action={
          canManage ? (
            <Link href="/guide" className={cn(buttonVariants({ variant: "outline" }))}>
              <Compass />
              Guide de configuration
            </Link>
          ) : undefined
        }
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
            {active === "entreprise" && <CompanySettings canEdit />}
            {active === "page-publique" && <PublicPageSettings />}
            {active === "abonnement" &&
              (data.kind === "Personal" ? (
                <PersonalSpace state={data} />
              ) : (
                <BusinessSubscription state={data} />
              ))}
            {active === "facturation" && (
              <SettingsTabs
                tabs={[
                  { value: "facture", label: "Facture", status: billingStatus, content: <BillingSettingsCard /> },
                  { value: "relances", label: "Relances", status: invoiceReminderStatus, content: <InvoiceReminderCard /> },
                  { value: "frais-automatiques", label: "Frais automatiques", count: autoFees?.length ?? 0, content: <InvoiceAutoFeesCard /> },
                ]}
              />
            )}
            {active === "soumissions" && (
              <SettingsTabs
                tabs={[
                  { value: "conditions", label: "Conditions", status: quoteTermsStatus, content: <QuoteTermsCard /> },
                  { value: "relances", label: "Relances", status: quoteReminderStatus, content: <QuoteReminderCard /> },
                  { value: "reponses", label: "Réponse par courriel", status: quoteResponsesStatus, content: <QuoteResponsesCard /> },
                ]}
              />
            )}
            {active === "courriel" && (
              <SettingsTabs
                tabs={[
                  { value: "facture", label: "Factures", status: invoiceEmailStatus, content: <EmailTemplateCard kind="facture" /> },
                  {
                    value: "soumission",
                    label: "Soumissions",
                    status: quoteEmailStatus,
                    content: <EmailTemplateCard kind="soumission" />,
                  },
                ]}
              />
            )}
            {active === "paiements" && (
              <SettingsTabs
                tabs={[
                  { value: "stripe", label: "Carte (Stripe)", status: stripeStatus, content: <OnlinePaymentsCard /> },
                  { value: "paypal", label: "PayPal", status: paypalStatus, content: <PayPalCard /> },
                ]}
              />
            )}
            {active === "taux" && (
              <SettingsTabs
                tabs={[
                  { value: "horaire", label: "Taux horaire", status: hourlyStatus, content: <HourlyRateCard /> },
                  {
                    value: "classements",
                    label: "Classements",
                    status: classificationsStatus,
                    content: <WageClassificationsCard />,
                  },
                ]}
              />
            )}
            {active === "assistant" && <AiAssistantCard />}
            {active === "integrations" && <McpKeysCard />}
            {active === "corbeille" && <TrashCard />}
            {active === "marge" && (
              <SettingsTabs
                tabs={[
                  { value: "mode", label: "Calcul de la marge", status: marginModeStatus, content: <MarginModeCard /> },
                  { value: "politiques", label: "Politiques de prix", count: pricePolicies?.length ?? 0, content: <PricePoliciesCard /> },
                ]}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
