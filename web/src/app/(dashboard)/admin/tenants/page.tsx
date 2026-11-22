"use client";

import { useState } from "react";
import { Building2, LogIn, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateTenantDialog } from "@/components/admin/create-tenant-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { SearchInput } from "@/components/layout/search-input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePlansQuery } from "@/hooks/use-catalog";
import { useTenantsQuery, useUpdateTenantPlan, useUpdateTenantSubscriptionStatus } from "@/hooks/use-tenants";
import { useAuth } from "@/lib/auth-context";
import { tenantStatusBadgeVariant, tenantStatusLabels } from "@/lib/labels";
import type { TenantSubscriptionStatus } from "@/lib/types";

const statuses = Object.keys(tenantStatusLabels) as TenantSubscriptionStatus[];

export default function TenantsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading } = useTenantsQuery(page, debouncedSearch);
  const updateStatus = useUpdateTenantSubscriptionStatus();
  const updatePlan = useUpdateTenantPlan();
  const { data: plans } = usePlansQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const { enterTenant } = useAuth();

  async function onStatusChange(id: string, status: TenantSubscriptionStatus) {
    try {
      await updateStatus.mutateAsync({ id, status });
      toast.success("Statut d'abonnement mis à jour.");
    } catch {
      toast.error("Impossible de mettre à jour le statut.");
    }
  }

  const NO_PLAN = "aucun";

  async function onPlanChange(id: string, value: string) {
    try {
      await updatePlan.mutateAsync({ id, planId: value === NO_PLAN ? null : value });
      toast.success("Forfait mis à jour.");
    } catch {
      toast.error("Impossible de changer le forfait.");
    }
  }

  async function onEnterTenant(id: string) {
    setEnteringId(id);
    try {
      await enterTenant(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'entrer dans ce locataire.");
      setEnteringId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Locataires"
        description="Les entreprises abonnées à Vexta."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Nouveau locataire
          </Button>
        }
      />

      <div className="mb-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Rechercher un locataire…" />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Aucun locataire"
          description="Les entreprises qui s'inscrivent ou que vous créez manuellement apparaîtront ici."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              Nouveau locataire
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entreprise</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Forfait</TableHead>
                <TableHead className="text-center">Utilisateurs</TableHead>
                <TableHead className="text-center">Clients</TableHead>
                <TableHead>Créé le</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((tenantItem) => (
                <TableRow key={tenantItem.id}>
                  <TableCell className="font-medium">
                    {tenantItem.name}
                    {tenantItem.kind === "Personal" && (
                      <span className="ml-2 align-middle text-xs font-normal text-muted-foreground">
                        Personnel
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {/* A personal space is free and has no Stripe subscription, so there is no
                        status to set here. */}
                    {tenantItem.kind === "Personal" ? (
                      <Badge variant="outline">Gratuit</Badge>
                    ) : (
                    <Select
                      value={tenantItem.subscriptionStatus}
                      onValueChange={(status) => onStatusChange(tenantItem.id, status as TenantSubscriptionStatus)}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue>
                          <Badge variant={tenantStatusBadgeVariant[tenantItem.subscriptionStatus]}>
                            {tenantStatusLabels[tenantItem.subscriptionStatus]}
                          </Badge>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((status) => (
                          <SelectItem key={status} value={status}>
                            {tenantStatusLabels[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    )}
                  </TableCell>
                  <TableCell>
                    {/* A personal space has no plan by design, so there is nothing to choose. */}
                    {tenantItem.kind === "Personal" ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <Select
                        value={tenantItem.planId ?? NO_PLAN}
                        onValueChange={(value) => onPlanChange(tenantItem.id, value as string)}
                      >
                        <SelectTrigger className="w-44">
                          {/* Children, not a bare SelectValue: without them it renders the raw
                              value, so the "aucun" sentinel would show through as itself. */}
                          <SelectValue>{tenantItem.planName ?? "Aucun forfait"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_PLAN}>Aucun forfait</SelectItem>
                          {(plans ?? []).map((plan) => (
                            <SelectItem key={plan.id} value={plan.id}>
                              {plan.name} — {plan.maxUsers} accès max
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {/* Used against allowed: a tenant over its limit is the thing to notice here. */}
                    <span className={tenantItem.userCount > tenantItem.maxUsers ? "font-medium text-destructive" : undefined}>
                      {tenantItem.userCount} / {tenantItem.maxUsers}
                    </span>
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">{tenantItem.clientCount}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(tenantItem.createdAt).toLocaleDateString("fr-CA")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={enteringId !== null}
                      onClick={() => onEnterTenant(tenantItem.id)}
                    >
                      {enteringId === tenantItem.id ? <Spinner /> : <LogIn />}
                      Entrer
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationBar result={data} onPageChange={setPage} />

      <CreateTenantDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
