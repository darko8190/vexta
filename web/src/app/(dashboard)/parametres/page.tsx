"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/layout/page-header";
import { BillingSettingsCard } from "@/components/settings/billing-settings-card";
import { useBillingStateQuery, type BillingState } from "@/hooks/use-billing";
import { usePublicPlansQuery } from "@/hooks/use-catalog";
import { ApiError, api } from "@/lib/api";
import { tenantStatusBadgeVariant, tenantStatusLabels } from "@/lib/labels";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

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
      <CardContent className="text-sm text-muted-foreground">
        {isActive
          ? "Votre abonnement est actif."
          : state.canManage
            ? "Votre abonnement n'est pas actif. Complétez le paiement pour accéder à tous les modules."
            : "Votre abonnement n'est pas actif. Demandez à un administrateur de votre entreprise de compléter le paiement."}
      </CardContent>
      {!isActive && state.canManage && (
        <CardFooter>
          <Button onClick={() => checkout.mutate()} disabled={checkout.isPending}>
            {checkout.isPending && <Spinner />}
            Activer l&apos;abonnement
          </Button>
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
                placeholder="Acme inc."
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

  return (
    <div>
      <PageHeader title="Paramètres" description="Votre espace Vexta et son abonnement." />

      <Suspense fallback={null}>
        <PaymentReturnNotice />
      </Suspense>

      {isLoading || !data ? (
        <Skeleton className="h-48 max-w-lg" />
      ) : data.kind === "Personal" ? (
        <PersonalSpace state={data} />
      ) : (
        <div className="space-y-6">
          <BusinessSubscription state={data} />
          {/* Only the owner sets these: they decide what every invoice the company sends says
              about its taxes and its terms. */}
          {data.canManage && <BillingSettingsCard />}
        </div>
      )}
    </div>
  );
}
