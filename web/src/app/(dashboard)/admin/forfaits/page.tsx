"use client";

import { useState } from "react";
import { AlertTriangle, MoreHorizontal, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { PlanFormSheet } from "@/components/catalog/plan-form-sheet";
import { useDeletePlan, usePlansQuery } from "@/hooks/use-catalog";
import { ApiError } from "@/lib/api";
import { formatCents } from "@/lib/money";
import type { PlanRecord } from "@/lib/types";

export default function PlansPage() {
  const { data, isLoading } = usePlansQuery();
  const deletePlan = useDeletePlan();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PlanRecord | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<PlanRecord | undefined>(undefined);

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deletePlan.mutateAsync(deleteTarget.id);
      toast.success("Forfait supprimé.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer ce forfait.");
    }
  }

  const createButton = (
    <Button onClick={openCreate}>
      <Plus />
      Nouveau forfait
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Forfaits"
        description="Les abonnements offerts sur le site public et choisis à l'inscription."
        action={createButton}
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="Aucun forfait pour l'instant"
          description="Créez un forfait pour qu'un prix apparaisse sur le site public et qu'une entreprise puisse s'inscrire."
          action={createButton}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Forfait</TableHead>
                <TableHead>Tarif</TableHead>
                <TableHead>Modules</TableHead>
                <TableHead className="text-center">Locataires</TableHead>
                <TableHead className="w-36">Statut</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell>
                    <div className="font-medium">{plan.name}</div>
                    {plan.description && (
                      <div className="max-w-xs truncate text-sm text-muted-foreground">{plan.description}</div>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatCents(plan.amountCents, plan.currency)}
                    <span className="text-muted-foreground"> / mois</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {plan.modules.length === 0 ? "—" : `${plan.modules.length} inclus`}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{plan.tenantCount}</Badge>
                  </TableCell>
                  <TableCell>
                    {plan.stripePriceId === null ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="size-3" />
                        Prix Stripe manquant
                      </Badge>
                    ) : (
                      <Badge variant={plan.isPublished ? "default" : "outline"}>
                        {plan.isPublished ? "Offert" : "Masqué"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(plan);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(plan)}>
                          <Trash2 />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PlanFormSheet open={formOpen} onOpenChange={setFormOpen} plan={editing} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer ce forfait ?"
        description={`« ${deleteTarget?.name} » disparaîtra du site public. Un forfait auquel des locataires sont abonnés ne peut pas être supprimé.`}
        onConfirm={confirmDelete}
        pending={deletePlan.isPending}
      />
    </div>
  );
}
