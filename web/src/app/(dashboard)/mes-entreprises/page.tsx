"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, ExternalLink, LogIn, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PageHeader } from "@/components/layout/page-header";
import { CreateCompanySheet } from "@/components/personal/create-company-sheet";
import { useMyCompaniesQuery, type MyCompany } from "@/hooks/use-my-companies";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const statusLabels: Record<string, { label: string; tone: "default" | "secondary" | "destructive" | "outline" }> = {
  Active: { label: "Actif", tone: "default" },
  Trialing: { label: "Essai", tone: "secondary" },
  Incomplete: { label: "Paiement à compléter", tone: "destructive" },
  PastDue: { label: "Paiement en retard", tone: "destructive" },
  Unpaid: { label: "Impayé", tone: "destructive" },
  Canceled: { label: "Annulé", tone: "outline" },
};

/**
 * Pattern 1 — List / Index. The companies this person runs, from their personal space.
 *
 * Cards rather than a table: there are rarely more than two or three, and each one's job is a
 * single button — go into it. Creating one opens the same questions a sign-up asks about a
 * company, without asking again who the person is.
 */
export default function MyCompaniesPage() {
  const { data, isLoading, isError, error, refetch } = useMyCompaniesQuery();
  const { enterWorkspace } = useAuth();
  const [creating, setCreating] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  const companies = data ?? [];

  async function open(company: MyCompany) {
    setOpening(company.tenantId);
    try {
      await enterWorkspace(company.tenantId);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Impossible d'ouvrir cette entreprise.");
      setOpening(null);
    }
  }

  const createButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus />
      Créer une entreprise
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Mes entreprises"
        description="Les entreprises dont vous êtes propriétaire ou administrateur."
        action={companies.length > 0 ? createButton : undefined}
      />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-36 w-full" />
          ))}
        </div>
      ) : isError && !data ? (
        <LoadErrorState
          error={error}
          title="Entreprises indisponibles"
          fallback="Vos entreprises n'ont pas pu être chargées."
          onRetry={() => void refetch()}
        />
      ) : companies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Aucune entreprise"
          description="Lancez la vôtre : clients, projets, facturation et employés, dans un espace à part de votre espace personnel."
          action={createButton}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => {
            const status = statusLabels[company.subscriptionStatus] ?? {
              label: company.subscriptionStatus,
              tone: "outline" as const,
            };

            return (
              <div key={company.tenantId} className="flex flex-col rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate font-medium text-foreground">{company.name}</h2>
                    <p className="text-xs text-muted-foreground">{company.planName ?? "Aucun forfait"}</p>
                  </div>
                  <Badge variant={status.tone}>{status.label}</Badge>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void open(company)} disabled={opening !== null}>
                    {opening === company.tenantId ? <Spinner /> : <LogIn />}
                    Ouvrir
                  </Button>
                  <Link
                    href={`/e/${company.slug}`}
                    className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                  >
                    <ExternalLink />
                    Page publique
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && <CreateCompanySheet open={creating} onOpenChange={setCreating} />}
    </div>
  );
}
