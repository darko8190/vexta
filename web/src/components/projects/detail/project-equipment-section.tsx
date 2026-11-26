"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { parseRate, rateText } from "@/components/equipment/equipment-form-sheet";
import { ClickableRow } from "@/components/layout/clickable-row";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { BilledNotice } from "@/components/projects/detail/billed-notice";
import { TaskPickerField } from "@/components/projects/detail/task-picker-field";
import {
  equipmentUnitLabels,
  useDeleteProjectEquipment,
  useEquipmentListQuery,
  useProjectEquipmentQuery,
  useSaveProjectEquipment,
  type ProjectEquipmentLine,
} from "@/hooks/use-equipment";
import { ApiError } from "@/lib/api";
import { formatDateOnly, todayIso } from "@/lib/dates";
import { formatAmount } from "@/lib/money";

/** "Aucun" in the equipment select: a line typed by hand, for something not on the list. */
const OTHER = "autre";

/**
 * The equipment used on this job: which machine, how many hours or days, at what rates. Each
 * line feeds the Équipements row of the cost table.
 */
export function ProjectEquipmentSection({
  projectId,
  locked,
  taskId,
}: {
  projectId: string;
  locked?: boolean;
  /** Narrows the list to one task, and files new lines against it — the task's own page. */
  taskId?: string;
}) {
  const { data, isLoading, isError, error, refetch } = useProjectEquipmentQuery(projectId);
  const remove = useDeleteProjectEquipment(projectId);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectEquipmentLine | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ProjectEquipmentLine | undefined>(undefined);

  function openForm(line?: ProjectEquipmentLine) {
    if (locked) return;
    setEditing(line);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Ligne retirée.");
      setDeleteTarget(undefined);
    } catch (failure) {
      toast.error(failure instanceof ApiError ? failure.message : "Impossible de retirer la ligne.");
    }
  }

  const createButton = locked ? undefined : (
    <Button onClick={() => openForm()}>
      <Plus />
      Ajouter un équipement
    </Button>
  );
  const lines = (data ?? []).filter((line) => !taskId || line.projectTaskId === taskId);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Équipements</h2>
          <p className="text-sm text-muted-foreground">Les machines et outils utilisés sur ce projet, au temps.</p>
        </div>
        {createButton}
      </div>

      {locked && <BilledNotice />}

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : isError && !data ? (
        <LoadErrorState error={error} onRetry={() => void refetch()} />
      ) : lines.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="Aucun équipement"
          description="La nacelle pour deux jours, l'excavatrice pour six heures. Les équipements se créent dans l'onglet Équipements."
          action={createButton}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Équipement</TableHead>
                <TableHead className="w-28">Date</TableHead>
                <TableHead className="text-right">Quantité</TableHead>
                <TableHead className="text-right">Coût</TableHead>
                <TableHead className="text-right">Vendant</TableHead>
                {!locked && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => {
                const cells = (
                  <>
                    <TableCell className="font-medium">
                      {line.name}
                      {line.projectTaskTitle && (
                        <div className="text-xs font-normal text-muted-foreground">{line.projectTaskTitle}</div>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{formatDateOnly(line.usedOn)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {line.quantity.toLocaleString("fr-CA")} {equipmentUnitLabels[line.unit]}
                      {line.quantity > 1 && line.unit !== "Unite" ? "s" : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatAmount(line.cost)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(line.selling)}</TableCell>
                    {!locked && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openForm(line)}>
                              <Pencil />
                              Modifier
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(line)}>
                              <Trash2 />
                              Retirer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </>
                );
                return locked ? (
                  <TableRow key={line.id}>{cells}</TableRow>
                ) : (
                  <ClickableRow key={line.id} label={`Ouvrir ${line.name}`} onOpen={() => openForm(line)}>
                    {cells}
                  </ClickableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {formOpen && (
        <EquipmentLineSheet
          open={formOpen}
          onOpenChange={setFormOpen}
          projectId={projectId}
          line={editing}
          defaultTaskId={taskId}
        />
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Retirer cette ligne ?"
        description={`« ${deleteTarget?.name ?? ""} » sera retiré du projet et de son tableau des coûts.`}
        pending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function EquipmentLineSheet({
  open,
  onOpenChange,
  projectId,
  line,
  defaultTaskId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  line?: ProjectEquipmentLine;
  defaultTaskId?: string;
}) {
  const save = useSaveProjectEquipment(projectId);
  const { data: catalogue } = useEquipmentListQuery(1, "", 100);
  const [equipmentId, setEquipmentId] = useState(line?.equipmentId ?? "");
  const [name, setName] = useState(line?.name ?? "");
  const [quantity, setQuantity] = useState(line ? rateText(line.quantity) : "1");
  const [cost, setCost] = useState(rateText(line?.costRate));
  const [selling, setSelling] = useState(rateText(line?.sellingRate));
  const [usedOn, setUsedOn] = useState(line?.usedOn ?? todayIso());
  const [notes, setNotes] = useState(line?.notes ?? "");
  const [taskId, setTaskId] = useState<string | null>(line ? line.projectTaskId : (defaultTaskId ?? null));

  const picked = catalogue?.items.find((e) => e.id === equipmentId);
  const unit = picked?.unit ?? line?.unit ?? "Heure";
  const quantityValue = parseRate(quantity);
  const costValue = parseRate(cost);
  const sellingValue = parseRate(selling);
  const valid =
    (equipmentId !== "" || name.trim() !== "") &&
    quantityValue != null &&
    quantityValue > 0 &&
    costValue !== undefined &&
    sellingValue !== undefined;

  function pick(id: string) {
    setEquipmentId(id === OTHER ? "" : id);
    const chosen = catalogue?.items.find((e) => e.id === id);
    // The equipment's own rates are the starting point; the line can be changed after.
    if (chosen) {
      setName(chosen.name);
      setCost(rateText(chosen.costRate));
      setSelling(rateText(chosen.sellingRate));
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;
    try {
      await save.mutateAsync({
        id: line?.id,
        values: {
          equipmentId: equipmentId || null,
          name: name.trim() || null,
          unit,
          quantity: quantityValue!,
          costRate: costValue ?? null,
          sellingRate: sellingValue ?? null,
          usedOn: usedOn || null,
          notes: notes.trim() || null,
          projectTaskId: taskId,
        },
      });
      toast.success(line ? "Ligne mise à jour." : "Équipement ajouté au projet.");
      onOpenChange(false);
    } catch (failure) {
      toast.error(failure instanceof ApiError ? failure.message : "Impossible d'enregistrer la ligne.");
    }
  }

  const unitLabel = equipmentUnitLabels[unit];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{line ? "Modifier la ligne" : "Ajouter un équipement"}</SheetTitle>
          <SheetDescription>Ce qui a servi sur le projet, et combien de temps.</SheetDescription>
        </SheetHeader>
        <form id="project-equipment-form" className="flex-1 overflow-y-auto px-4" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="line-equipment">
                Équipement
                <RequiredMark />
              </FieldLabel>
              <Select value={equipmentId || OTHER} onValueChange={(value) => value && pick(value)}>
                <SelectTrigger id="line-equipment" className="w-full">
                  <SelectValue>
                    {(value: string) =>
                      value === OTHER ? "Autre (saisi à la main)" : (catalogue?.items.find((e) => e.id === value)?.name ?? name ?? "…")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(catalogue?.items ?? []).map((equipment) => (
                    <SelectItem key={equipment.id} value={equipment.id} disabled={equipment.status !== "Disponible"}>
                      {equipment.name}
                      {equipment.status !== "Disponible" && <span className="text-muted-foreground"> — indisponible</span>}
                    </SelectItem>
                  ))}
                  <SelectItem value={OTHER}>Autre (saisi à la main)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {!equipmentId && (
              <Field>
                <FieldLabel htmlFor="line-name">
                  Nom
                  <RequiredMark />
                </FieldLabel>
                <Input id="line-name" value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
              </Field>
            )}
            <TaskPickerField id="line-task" projectId={projectId} value={taskId} onChange={setTaskId} />
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="line-quantity">Quantité ({unitLabel}s)</FieldLabel>
                <Input
                  id="line-quantity"
                  inputMode="decimal"
                  value={quantity}
                  aria-invalid={quantityValue == null || quantityValue <= 0}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="line-date">Date</FieldLabel>
                <Input id="line-date" type="date" value={usedOn} onChange={(event) => setUsedOn(event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="line-cost">Coûtant ($ / {unitLabel})</FieldLabel>
                <Input
                  id="line-cost"
                  inputMode="decimal"
                  value={cost}
                  aria-invalid={costValue === undefined}
                  onChange={(event) => setCost(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="line-selling">Vendant ($ / {unitLabel})</FieldLabel>
                <Input
                  id="line-selling"
                  inputMode="decimal"
                  value={selling}
                  aria-invalid={sellingValue === undefined}
                  onChange={(event) => setSelling(event.target.value)}
                />
              </Field>
            </div>
            {quantityValue != null && quantityValue > 0 && (
              <FieldDescription>
                Coût {formatAmount(quantityValue * (costValue ?? 0))} · vendu {formatAmount(quantityValue * (sellingValue ?? 0))}
              </FieldDescription>
            )}
            <Field>
              <FieldLabel htmlFor="line-notes">Notes</FieldLabel>
              <Textarea id="line-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
          </FieldGroup>
        </form>
        <SheetFooter>
          <Button type="submit" form="project-equipment-form" disabled={save.isPending || !valid}>
            {save.isPending && <Spinner />}
            {line ? "Enregistrer" : "Ajouter"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
