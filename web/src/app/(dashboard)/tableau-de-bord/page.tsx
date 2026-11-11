"use client";

import Link from "next/link";
import { Building2, FileText, FolderKanban, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
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
  const isSuperAdmin = user?.role === "SuperAdmin";

  return (
    <div>
      <PageHeader
        title={`Bonjour, ${user?.firstName ?? ""}`}
        description={
          isSuperAdmin
            ? "Vue d'ensemble de la plateforme Vexta."
            : user?.tenantSubscriptionStatus
              ? `${user.tenantName} — abonnement ${tenantStatusLabels[user.tenantSubscriptionStatus]}`
              : undefined
        }
      />
      {isSuperAdmin ? <SuperAdminDashboard /> : <TenantDashboard />}
    </div>
  );
}
