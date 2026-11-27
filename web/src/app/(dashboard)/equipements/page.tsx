"use client";

import { useState, useEffect } from "react";
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
import { ApiError, api } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import { SortableHead } from "@/components/layout/sortable-head";
import { byKeys, sortRows, type SortState } from "@/lib/table-sort";
import { BulkActionBar, SelectAllHead, SelectRowCell, useRowSelection, type BulkAction } from "@/components/layout/bulk-actions";

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
  const [sort, setSort] = useState<SortState | null>({ key: "numero", dir: "desc" });
  const debounced = useDebouncedValue(search);
  const { data, isLoading, isError, error, refetch } = useEquipmentListQuery(page, debounced);
  const remove = useDeleteEquipment();
  const selection = useRowSelection(data?.items ?? [], (equipment) => equipment.id);
  const selectable = canCreate;
  const bulkActions: BulkAction<Equipment>[] = [
    {
      key: "supprimer",
      label: "Supprimer",
      icon: Trash2,
      destructive: true,
      confirm: {
        title: "Supprimer la sélection ?",
        description: (count) => `${count} équipement(s) iront à la corbeille (Paramètres). Vous pourrez les restaurer.`,
      },
      run: (equipment) => remove.mutateAsync(equipment.id),
      done: (count) => (count > 1 ? `${count} équipements supprimés.` : "Équipement supprimé."),
    },
  ];

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Equipment | undefined>(undefined);

  function openForm(equipment?: Equipment) {
    setEditing(equipment);
    setFormOpen(true);
  }

  // ?id= from a project's equipment line: opens that equipment's file directly.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;
    api
      .get<Equipment>(`equipements/${id}`)
      .then((equipment) => {
        setEditing(equipment);
        setFormOpen(true);
      })
      .catch(() => toast.error("Cet équipement est introuvable."));
  }, []);

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
          {selectable && (
            <BulkActionBar selection={selection} actions={bulkActions} className="mb-0 rounded-none border-0 border-b" />
          )}
          <Table>
            <TableHeader>
              <TableRow>
                {selectable && <SelectAllHead selection={selection} />}
                <SortableHead label="Numéro" sortKey="numero" sort={sort} onSort={setSort} className="w-24" />
                <SortableHead label="Équipement" sortKey="nom" sort={sort} onSort={setSort} />
                <SortableHead label="État" sortKey="etat" sort={sort} onSort={setSort} />
                <SortableHead label="Coûtant" sortKey="cout" sort={sort} onSort={setSort} className="text-right" />
                <SortableHead label="Vendant" sortKey="vendant" sort={sort} onSort={setSort} className="text-right" />
                <SortableHead label="Projets" sortKey="projets" sort={sort} onSort={setSort} className="text-center" />
                {canCreate && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortRows(data.items, sort, byKeys((equipment) => ({ numero: equipment.number, nom: equipment.name, etat: equipment.status, cout: equipment.costRate, vendant: equipment.sellingRate, projets: equipment.projectCount }))).map((equipment) => {
                const cells = (
                  <>
                    {selectable && <SelectRowCell selection={selection} row={equipment} label={equipment.name} />}
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
