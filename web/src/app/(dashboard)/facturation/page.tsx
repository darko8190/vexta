"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/layout/page-header";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { tenantStatusBadgeVariant, tenantStatusLabels } from "@/lib/labels";

export default function BillingPage() {
  const { user } = useAuth();
  const status = user?.tenantSubscriptionStatus ?? "Incomplete";
  const isActive = status === "Active";
  const canManageBilling = user?.role === "TenantAdmin";

  const checkout = useMutation({
    mutationFn: () => api.post<{ checkoutUrl: string }>("billing/checkout-session"),
    onSuccess: (data) => {
      window.location.assign(data.checkoutUrl);
    },
    onError: () => toast.error("Impossible de démarrer le paiement. Réessayez plus tard."),
  });

  return (
    <div>
      <PageHeader title="Facturation" description="Gérez l'abonnement mensuel de votre entreprise à Vexta." />

      <Card className="max-w-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="size-4" />
              Abonnement Vexta
            </CardTitle>
            <Badge variant={tenantStatusBadgeVariant[status]}>{tenantStatusLabels[status]}</Badge>
          </div>
          <CardDescription>{user?.tenantName}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {isActive
            ? "Votre abonnement est actif. Merci de faire confiance à Vexta."
            : canManageBilling
              ? "Votre abonnement n'est pas actif. Complétez le paiement pour accéder à tous les modules."
              : "Votre abonnement n'est pas actif. Demandez à un administrateur de votre entreprise de compléter le paiement."}
        </CardContent>
        {!isActive && canManageBilling && (
          <CardFooter>
            <Button onClick={() => checkout.mutate()} disabled={checkout.isPending}>
              {checkout.isPending && <Spinner />}
              Activer l&apos;abonnement
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
