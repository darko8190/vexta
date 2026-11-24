"use client";

import Link from "next/link";
import { ClipboardPen, FileText, FolderKanban, UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminDashboardStats } from "@/components/dashboard/admin-dashboard-stats";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { UpgradeCta } from "@/components/layout/upgrade-cta";
import { useProjectsQuery } from "@/hooks/use-projects";
import { useInvoicesQuery } from "@/hooks/use-invoices";
import { useQuotesQuery } from "@/hooks/use-quotes";
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

/**
 * The company's own screen.
 *
 * It used to be three tiles counting rows: how many clients, how many projects, how many
 * invoices. Those are numbers that only ever go up, and none of them answers a question anybody
 * opens the application with. What was billed this month, what is still owed, what is late and
 * what needs deciding are questions — so that is what is here now, answered in one request
 * instead of three list endpoints paging their first twenty-five rows.
 */
function TenantDashboard() {
  return <DashboardStats />;
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
 * A customer's own numbers. The client directory is closed to them, so asking for its count
 * would be a refused request behind a tile that could only ever show a dash. The quotes tile
 * counts the ones still waiting for their answer, which is the only figure there they act on.
 */
function ClientDashboard() {
  const { data: projects } = useProjectsQuery(1, "");
  const { data: quotes } = useQuotesQuery(1, "", "Envoyee");
  const { data: invoices } = useInvoicesQuery(1, "");

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard href="/projets" label="Mes projets" value={projects?.totalCount ?? "—"} icon={FolderKanban} />
      <StatCard href="/soumissions" label="Soumissions à répondre" value={quotes?.totalCount ?? "—"} icon={ClipboardPen} />
      <StatCard href="/factures" label="Mes factures" value={invoices?.totalCount ?? "—"} icon={FileText} />
    </div>
  );
}

/**
 * One tile counting tenants was all this screen had. What the platform actually needs to know
 * is how many companies are paying, how many are on trial, and which of them somebody has to
 * chase — an expired trial nobody followed up, an account past due, a signup that never paid.
 */
function SuperAdminDashboard() {
  return <AdminDashboardStats />;
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
