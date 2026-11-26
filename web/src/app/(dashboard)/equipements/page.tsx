"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EquipmentFormSheet } from "@/components/equipment/equipment-form-sheet";
import { ClickableRow } from "@/components/layout/clickable-row";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PageHeader } from "@/components/layout/page-header";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { SearchInput } from "@/components/layout/search-input";
import { useCanCreate } from "@/hooks/use-can-create";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  equipmentStatusLabels,
  equipmentUnitLabels,
  formatEquipmentNumber,
  useDeleteEquipment,
  useEquipmentListQuery,
  type Equipment,
} from "@/hooks/use-equipment";
import { ApiError } from "@/lib/api";
import { formatAmount } from "@/lib/money";

function rate(value: number | null, unit: Equipment["unit"]) {
  return value == null ? "—" : `${formatAmount(value)} / ${equipmentUnitLabels[unit]}`;
}

/**
 * Pattern 1 — List / Index. The company's machines and tools, with what an hour or a day of
 * each costs and sells for. Using one on a job is done from the job's Équipements section.
 */
export default function EquipmentPage() {
  const canCreate = useCanCreate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search);
  const { data, isLoading, isError, error, refetch } = useEquipmentListQuery(page, debounced);
  const remove = useDeleteEquipment();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Equipment | undefined>(undefined);

  function openForm(equipment?: Equipment) {
    setEditing(equipment);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Équipement supprimé.");
      setDeleteTarget(undefined);
    } catch (failure) {
      toast.error(failure instanceof ApiError ? failure.message : "Impossible de supprimer l'équipement.");
    }
  }

  const createButton = canCreate ? (
    <Button onClick={() => openForm()}>
      <Plus />
      Nouvel équipement
    </Button>
  ) : undefined;

  return (
    <div>
      <PageHeader
        title="Équipements"
        description="Vos machines et outils, et ce qu'une heure ou une journée de chacun coûte et se facture."
        action={createButton}
      />

      <SearchInput
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="Rechercher un équipement…"
        className="mb-4"
      />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : isError && !data ? (
        <LoadErrorState error={error} onRetry={() => void refetch()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={debounced ? "Aucun équipement trouvé" : "Aucun équipement pour l'instant"}
          description={debounced ? "Essayez une autre recherche." : "Ajoutez la nacelle, l'excavatrice ou le camion que vous facturez au temps."}
          action={debounced ? undefined : createButton}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Numéro</TableHead>
                <TableHead>Équipement</TableHead>
                <TableHead>État</TableHead>
                <TableHead className="text-right">Coûtant</TableHead>
                <TableHead className="text-right">Vendant</TableHead>
                <TableHead className="text-center">Projets</TableHead>
                {canCreate && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((equipment) => {
                const cells = (
                  <>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatEquipmentNumber(equipment.number)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {equipment.name}
                      {equipment.isRented && (
                        <Badge variant="outline" className="ml-2">
                          Loué
                        </Badge>
                      )}
                      {equipment.serialNumber && (
                        <div className="text-xs font-normal text-muted-foreground">Série {equipment.serialNumber}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={equipment.status === "Disponible" ? "secondary" : "destructive"}>
                        {equipmentStatusLabels[equipment.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{rate(equipment.costRate, equipment.unit)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{rate(equipment.sellingRate, equipment.unit)}</TableCell>
                    <TableCell className="text-center tabular-nums">{equipment.projectCount}</TableCell>
                    {canCreate && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openForm(equipment)}>
                              <Pencil />
                              Modifier
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(equipment)}>
                              <Trash2 />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </>
                );
                return canCreate ? (
                  <ClickableRow key={equipment.id} label={`Ouvrir ${equipment.name}`} onOpen={() => openForm(equipment)}>
                    {cells}
                  </ClickableRow>
                ) : (
                  <TableRow key={equipment.id}>{cells}</TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="mt-4">
        <PaginationBar result={data} onPageChange={setPage} />
      </div>

      {formOpen && <EquipmentFormSheet open={formOpen} onOpenChange={setFormOpen} equipment={editing} />}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer cet équipement ?"
        description={`« ${deleteTarget?.name ?? ""} » sera retiré de la liste. Ses lignes sur les projets restent, avec leur nom.`}
        pending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
