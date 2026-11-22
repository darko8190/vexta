"use client";

import Link from "next/link";
import { Building2, FileText, FolderKanban, UserRound, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { UpgradeCta } from "@/components/layout/upgrade-cta";
import { useClientsQuery } from "@/hooks/use-clients";
import { useProjectsQuery } from "@/hooks/use-projects";
import { useInvoicesQuery } from "@/hooks/use-invoices";
import { useTenantsQuery } from "@/hooks/use-tenants";
import { useAuth } from "@/lib/auth-context";
import { tenantStatusLabels } from "@/lib/labels";

function StatCard({
  href,
  label,
  value,
  icon: Icon,
}: {
  href: string;
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:border-primary/50">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          <Icon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{value}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function TenantDashboard() {
  const { data: clients } = useClientsQuery(1, "");
  const { data: projects } = useProjectsQuery(1, "");
  const { data: invoices } = useInvoicesQuery(1, "");

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard href="/clients" label="Clients" value={clients?.totalCount ?? "—"} icon={Users} />
      <StatCard href="/projets" label="Projets" value={projects?.totalCount ?? "—"} icon={FolderKanban} />
      <StatCard href="/factures" label="Factures" value={invoices?.totalCount ?? "—"} icon={FileText} />
    </div>
  );
}

/**
 * Nothing yet, and it says so. A personal space is free and holds none of the company modules,
 * so tiles linking to clients, projects and invoices would each lead to a screen whose only
 * content is an invitation to buy a business plan. What belongs here is still being decided.
 */
function PersonalDashboard() {
  return (
    <EmptyState
      icon={UserRound}
      title="Votre espace personnel est vide"
      description="Rien à gérer ici pour l'instant. Les clients, les projets et les factures appartiennent à un compte entreprise."
      action={<UpgradeCta />}
    />
  );
}

/**
 * A customer's own two numbers. The client directory is closed to them, so asking for its count
 * would be a refused request behind a tile that could only ever show a dash.
 */
function ClientDashboard() {
  const { data: projects } = useProjectsQuery(1, "");
  const { data: invoices } = useInvoicesQuery(1, "");

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <StatCard href="/projets" label="Mes projets" value={projects?.totalCount ?? "—"} icon={FolderKanban} />
      <StatCard href="/factures" label="Mes factures" value={invoices?.totalCount ?? "—"} icon={FileText} />
    </div>
  );
}

function SuperAdminDashboard() {
  const { data: tenants } = useTenantsQuery(1, "");

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard href="/admin/tenants" label="Locataires" value={tenants?.totalCount ?? "—"} icon={Building2} />
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SuperAdmin" && !user.isImpersonating;

  return (
    <div>
      <PageHeader
        title={`Bonjour, ${user?.firstName ?? ""}`}
        description={
          isSuperAdmin
            ? "Vue d'ensemble de la plateforme Vexta."
            : user?.role === "Client"
              ? `Vos dossiers chez ${user.tenantName}`
              : // A personal space has no subscription, so showing its status would read as a
              // problem where there is none.
              user?.tenantKind === "Personal"
              ? `${user.tenantName} — espace personnel gratuit`
              : user?.tenantSubscriptionStatus
                ? `${user.tenantName} — abonnement ${tenantStatusLabels[user.tenantSubscriptionStatus]}`
                : undefined
        }
      />
      {isSuperAdmin ? (
        <SuperAdminDashboard />
      ) : user?.role === "Client" ? (
        <ClientDashboard />
      ) : user?.tenantKind === "Personal" ? (
        <PersonalDashboard />
      ) : (
        <TenantDashboard />
      )}
    </div>
  );
}
