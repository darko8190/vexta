"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Blocks, Building2, Clock, Tag, UserPlus, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { useAdminDashboardQuery } from "@/hooks/use-dashboard";
import { cn } from "@/lib/utils";

function Tile({
  href,
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  href: string;
  label: string;
  value: number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "warning";
}) {
  return (
    <Link href={href} className="group">
      <Card className="h-full transition-colors group-hover:border-primary/50">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          <Icon
            className={cn("size-4", tone === "warning" ? "text-destructive" : "text-muted-foreground")}
          />
        </CardHeader>
        <CardContent>
          <p
            className={cn(
              "text-2xl font-semibold tabular-nums",
              tone === "warning" && "text-destructive",
            )}
          >
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * The platform's own figures.
 *
 * The lines under the tiles are the ones somebody has to do something about: a trial that ran
 * out with nobody chasing it, an account past due, a signup that never finished paying. Each is
 * hidden at zero — a panel of six zeros is a panel people learn to skip.
 */
export function AdminDashboardStats() {
  const { data, isLoading, isError, error, refetch } = useAdminDashboardQuery();

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <LoadErrorState
        error={error}
        title="Tableau de bord indisponible"
        fallback="Les chiffres de la plateforme n'ont pas pu être chargés."
        onRetry={() => refetch()}
      />
    );
  }

  const needsAttention = [
    data.trialExpired > 0 && {
      key: "trial",
      label:
        data.trialExpired === 1
          ? "1 essai terminé sans abonnement"
          : `${data.trialExpired} essais terminés sans abonnement`,
    },
    data.pastDue > 0 && {
      key: "pastdue",
      label: data.pastDue === 1 ? "1 compte en souffrance" : `${data.pastDue} comptes en souffrance`,
    },
    data.incomplete > 0 && {
      key: "incomplete",
      label:
        data.incomplete === 1
          ? "1 inscription jamais payée"
          : `${data.incomplete} inscriptions jamais payées`,
    },
  ].filter((line): line is { key: string; label: string } => Boolean(line));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          href="/admin/tenants"
          label="Entreprises"
          value={data.businessTenants}
          hint={`${data.active} ${data.active === 1 ? "abonnée" : "abonnées"}`}
          icon={Building2}
        />
        <Tile
          href="/admin/tenants"
          label="En essai"
          value={data.trialing}
          hint="Essai en cours, jours restants"
          icon={Clock}
        />
        <Tile
          href="/admin/tenants"
          label="Nouvelles ce mois-ci"
          value={data.newThisMonth}
          hint="Entreprises créées depuis le 1er"
          icon={UserPlus}
        />
        <Tile
          href="/admin/tenants"
          label="Comptes"
          value={data.users}
          hint={`${data.personalSpaces} ${data.personalSpaces === 1 ? "espace personnel" : "espaces personnels"}`}
          icon={Users}
        />
        <Tile
          href="/admin/forfaits"
          label="Forfaits publiés"
          value={data.publishedPlans}
          hint="Visibles à l'inscription"
          icon={Tag}
        />
        <Tile
          href="/admin/modules"
          label="Modules"
          value={data.modules}
          hint="Les onglets qu'un forfait peut inclure"
          icon={Blocks}
        />
      </div>

      {needsAttention.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">À surveiller</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {needsAttention.map((line) => (
                <li key={line.key}>
                  <Link
                    href="/admin/tenants"
                    className="flex items-center gap-3 py-2.5 text-sm transition-colors hover:text-primary"
                  >
                    <AlertTriangle className="size-4 shrink-0 text-destructive" />
                    <span className="min-w-0 flex-1">{line.label}</span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
