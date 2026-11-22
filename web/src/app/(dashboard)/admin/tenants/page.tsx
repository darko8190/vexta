"use client";

import { useState } from "react";
import { Building2, LogIn, Plus, UserRound } from "lucide-react";
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
const NO_PLAN = "aucun";

/** Entering a tenant is the one action both tables share. */
function EnterButton({ id }: { id: string }) {
  const { enterTenant } = useAuth();
  const [entering, setEntering] = useState(false);

  async function onEnter() {
    setEntering(true);
    try {
      await enterTenant(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'entrer dans ce locataire.");
      setEntering(false);
    }
  }

  return (
    <Button variant="outline" size="sm" disabled={entering} onClick={onEnter}>
      {entering ? <Spinner /> : <LogIn />}
      Entrer
    </Button>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function BusinessTenants({ search, onCreate }: { search: string; onCreate: () => void }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useTenantsQuery(page, search, "Business");
  const { data: plans } = usePlansQuery();
  const updateStatus = useUpdateTenantSubscriptionStatus();
  const updatePlan = useUpdateTenantPlan();

  async function onStatusChange(id: string, status: TenantSubscriptionStatus) {
    try {
      await updateStatus.mutateAsync({ id, status });
      toast.success("Statut d'abonnement mis à jour.");
    } catch {
      toast.error("Impossible de mettre à jour le statut.");
    }
  }

  async function onPlanChange(id: string, value: string) {
    try {
      await updatePlan.mutateAsync({ id, planId: value === NO_PLAN ? null : value });
      toast.success("Forfait mis à jour.");
    } catch {
      toast.error("Impossible de changer le forfait.");
    }
  }

  return (
    <section className="mb-10">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-foreground">Entreprises</h2>
        <p className="text-sm text-muted-foreground">
          Les espaces qui portent un forfait, des accès et un abonnement Stripe.
        </p>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Aucune entreprise"
          description="Les entreprises qui s'inscrivent ou que vous créez manuellement apparaîtront ici."
          action={
            <Button onClick={onCreate}>
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
                  <TableCell className="font-medium">{tenantItem.name}</TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell>
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
                    <EnterButton id={tenantItem.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationBar result={data} onPageChange={setPage} />
    </section>
  );
}

/**
 * A personal space is free, carries no plan and holds one person, so the columns that matter for
 * a company — status, forfait, sièges — would all read the same here and say nothing. It gets
 * its own table rather than a row in the company one with four dashes across it.
 */
function PersonalTenants({ search }: { search: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useTenantsQuery(page, search, "Personal");

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-base font-semibold text-foreground">Espaces personnels</h2>
        <p className="text-sm text-muted-foreground">
          Gratuits, sans forfait et sans abonnement. Chaque compte en a un.
        </p>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="Aucun espace personnel"
          description="Il s'en crée un la première fois qu'une personne ouvre son sélecteur d'espaces."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Espace</TableHead>
                <TableHead className="text-center">Clients</TableHead>
                <TableHead>Créé le</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((tenantItem) => (
                <TableRow key={tenantItem.id}>
                  <TableCell className="font-medium">{tenantItem.name}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{tenantItem.clientCount}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(tenantItem.createdAt).toLocaleDateString("fr-CA")}
                  </TableCell>
                  <TableCell className="text-right">
                    <EnterButton id={tenantItem.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationBar result={data} onPageChange={setPage} />
    </section>
  );
}

export default function TenantsPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Locataires"
        description="Les entreprises abonnées à Vexta et les espaces personnels."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Nouveau locataire
          </Button>
        }
      />

      {/* One search box for both tables: looking for a name is the same act whichever kind it
          turns out to be, and two boxes would make you guess first. */}
      <div className="mb-6">
        <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un locataire…" />
      </div>

      {/* Keyed by the search so a new one starts at page 1. Without it, searching while on
          page 3 asks for page 3 of a shorter list and shows an empty table. */}
      <BusinessTenants key={`b:${debouncedSearch}`} search={debouncedSearch} onCreate={() => setCreateOpen(true)} />
      <PersonalTenants key={`p:${debouncedSearch}`} search={debouncedSearch} />

      <CreateTenantDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
