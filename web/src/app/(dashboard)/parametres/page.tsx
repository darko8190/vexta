"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { api } from "@/lib/api";
import { tenantStatusBadgeVariant, tenantStatusLabels } from "@/lib/labels";
import type { TenantSubscriptionStatus } from "@/lib/types";

interface BillingState {
  tenantName: string;
  kind: "Business" | "Personal";
  subscriptionStatus: TenantSubscriptionStatus;
  currentPeriodEnd: string | null;
  canManage: boolean;
}

function PaymentReturnNotice() {
  const settled = useSearchParams().get("abonnement") === "succes";
  if (!settled) return null;

  return (
    <p className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
      Paiement reçu. L&apos;activation se fait dès que Stripe nous confirme la transaction —
      rechargez la page dans un instant si rien n&apos;a changé.
    </p>
  );
}

function BusinessSubscription({ state }: { state: BillingState }) {
  const isActive = state.subscriptionStatus === "Active";

  const checkout = useMutation({
    mutationFn: () => api.post<{ checkoutUrl: string }>("billing/checkout-session"),
    onSuccess: (data) => window.location.assign(data.checkoutUrl),
    onError: () => toast.error("Impossible de démarrer le paiement. Réessayez plus tard."),
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
        <CardDescription>{state.tenantName}</CardDescription>
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

  const upgrade = useMutation({
    mutationFn: () => api.post<{ checkoutUrl: string }>("billing/upgrade", { companyName }),
    onSuccess: (data) => window.location.assign(data.checkoutUrl),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Impossible de démarrer le paiement."),
  });

  const canSubmit = companyName.trim().length >= 2 && !upgrade.isPending;

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
  const { data, isLoading } = useQuery({
    queryKey: ["billing-state"],
    queryFn: () => api.get<BillingState>("billing/state"),
  });

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
        <BusinessSubscription state={data} />
      )}
    </div>
  );
}
