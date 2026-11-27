"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { SearchInput } from "@/components/layout/search-input";
import {
  equipmentUnitLabels,
  useDeleteProjectEquipment,
  useEquipmentListQuery,
  useProjectEquipmentQuery,
  useSaveProjectEquipment,
  type Equipment,
  type EquipmentUnit,
  type ProjectEquipmentFormValues,
  type ProjectEquipmentLine,
} from "@/hooks/use-equipment";
import { ApiError } from "@/lib/api";
import { useIsCrewView } from "@/hooks/use-can-create";
import { NeedsReviewDot } from "@/components/projects/detail/material-row";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { matchesSearch } from "@/lib/text-match";

/** "Autre" in the equipment select: a line typed by hand, for something not on the list. */
const OTHER = "autre";

/** The columns, shared by the headings and every row. Below lg each field carries its label. */
const GRID = "lg:grid-cols-[minmax(0,1fr)_140px_90px_110px_110px_110px_76px]";
/** The crew's columns: what was used, when, and how much — never the rates. */
const CREW_GRID = "lg:grid-cols-[minmax(0,1fr)_140px_90px_76px]";

type RowValues = ProjectEquipmentFormValues & { unit: EquipmentUnit };

function toValues(line: ProjectEquipmentLine): RowValues {
  return {
    equipmentId: line.equipmentId,
    name: line.name,
    unit: line.unit,
    quantity: line.quantity,
    costRate: line.costRate,
    sellingRate: line.sellingRate,
    usedOn: line.usedOn,
    notes: line.notes,
    projectTaskId: line.projectTaskId,
  };
}

function blankValues(taskId?: string): RowValues {
  return {
    equipmentId: null,
    name: "",
    unit: "Heure",
    quantity: 1,
    costRate: null,
    sellingRate: null,
    usedOn: todayIso(),
    notes: null,
    projectTaskId: taskId ?? null,
  };
}

function isSavable(values: RowValues): boolean {
  return (Boolean(values.equipmentId) || (values.name ?? "").trim() !== "") && values.quantity > 0;
}

interface Draft {
  uid: string;
  values: RowValues;
}

/**
 * The equipment used on this job, edited in place like the materials: pick the machine, the
 * day, how long, and the rates follow from the equipment's file. Each line feeds the
 * Équipements row of the cost table and the invoice generated from the project.
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
  const crew = useIsCrewView();
  // The crew never sees the rates, so it never sends any: the API keeps the office's.
  const outgoing = (values: RowValues): RowValues => (crew ? { ...values, costRate: null, sellingRate: null } : values);
  const { data, isLoading, isError, error, refetch } = useProjectEquipmentQuery(projectId);
  const { data: catalogue } = useEquipmentListQuery(1, "", 100);
  const save = useSaveProjectEquipment(projectId);
  const remove = useDeleteProjectEquipment(projectId);

  const [edits, setEdits] = useState<Record<string, RowValues>>({});
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ProjectEquipmentLine | undefined>(undefined);
  const [search, setSearch] = useState("");

  const sent = useRef<Record<string, string>>({});
  const posting = useRef(new Set<string>());
  const nextUid = useRef(0);

  const lines = (data ?? []).filter(
    (line) =>
      (!taskId || line.projectTaskId === taskId) &&
      matchesSearch(search, line.name, line.notes, line.projectTaskTitle),
  );
  const equipment = catalogue?.items ?? [];

  function valuesOf(line: ProjectEquipmentLine): RowValues {
    return edits[line.id] ?? toValues(line);
  }

  function message(failure: unknown, fallback: string) {
    return failure instanceof ApiError ? failure.message : fallback;
  }

  async function commitExisting(line: ProjectEquipmentLine, values: RowValues) {
    if (!isSavable(values)) return;
    const payload = JSON.stringify(values);
    const baseline = sent.current[line.id] ?? JSON.stringify(toValues(line));
    if (payload === baseline) return;
    sent.current[line.id] = payload;
    try {
      await save.mutateAsync({ id: line.id, values: outgoing(values) });
    } catch (failure) {
      delete sent.current[line.id];
      toast.error(message(failure, "Impossible d'enregistrer la ligne."));
    }
  }

  async function commitDraft(uid: string, values: RowValues) {
    if (!isSavable(values) || posting.current.has(uid)) return;
    posting.current.add(uid);
    try {
      await save.mutateAsync({ values: outgoing(values) });
      setDrafts((previous) => previous.filter((draft) => draft.uid !== uid));
    } catch (failure) {
      toast.error(message(failure, "Impossible d'ajouter l'équipement."));
    } finally {
      posting.current.delete(uid);
    }
  }

  function addDraft() {
    nextUid.current += 1;
    setDrafts((previous) => [...previous, { uid: `draft-${nextUid.current}`, values: blankValues(taskId) }]);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    try {
      await remove.mutateAsync(id);
      setEdits((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      delete sent.current[id];
      toast.success("Ligne retirée.");
      setDeleteTarget(undefined);
    } catch (failure) {
      toast.error(message(failure, "Impossible de retirer la ligne."));
    }
  }

  const addButton = locked ? undefined : (
    <Button onClick={addDraft}>
      <Plus />
      Ajouter un équipement
    </Button>
  );

  const total =
    lines.reduce((sum, line) => sum + lineSelling(valuesOf(line)), 0) +
    drafts.reduce((sum, draft) => sum + lineSelling(draft.values), 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Équipements</h2>
          <p className="text-sm text-muted-foreground">Les machines et outils utilisés sur ce projet, au temps.</p>
        </div>
        {addButton}
      </div>

      {(data?.length ?? 0) > 0 && (
        <div className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un équipement…" />
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : isError && !data ? (
        <LoadErrorState error={error} onRetry={() => void refetch()} />
      ) : lines.length + drafts.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={search ? "Aucun équipement ne correspond" : "Aucun équipement"}
          description="La nacelle pour deux jours, l'excavatrice pour six heures. Les équipements se créent dans l'onglet Équipements."
          action={search ? undefined : addButton}
        />
      ) : (
        <div className="space-y-3">
          <div className={`hidden items-end gap-2 px-3 text-xs font-medium text-muted-foreground lg:grid ${crew ? CREW_GRID : GRID}`}>
            <span>Équipement</span>
            <span>Date</span>
            <span className="text-right">Qté</span>
            {!crew && (
              <>
                <span className="text-right">Coûtant / unité</span>
                <span className="text-right">Vendant / unité</span>
                <span className="text-right">Total</span>
              </>
            )}
            <span />
          </div>

          {lines.map((line) => (
            <EquipmentRow
              key={line.id}
              values={valuesOf(line)}
              equipment={equipment}
              disabled={locked}
              taskTitle={line.projectTaskTitle}
              crew={crew}
              needsReview={!crew && !line.equipmentId && !line.sellingRate}
              onChange={(next) => setEdits((previous) => ({ ...previous, [line.id]: next }))}
              onCommit={(next) => void commitExisting(line, next)}
              onRemove={() => setDeleteTarget(line)}
            />
          ))}

          {!locked &&
            drafts.map((draft) => (
              <EquipmentRow
                key={draft.uid}
                values={draft.values}
                equipment={equipment}
                crew={crew}
                onChange={(next) =>
                  setDrafts((previous) => previous.map((row) => (row.uid === draft.uid ? { ...row, values: next } : row)))
                }
                onCommit={(next) => void commitDraft(draft.uid, next)}
                onRemove={() => setDrafts((previous) => previous.filter((row) => row.uid !== draft.uid))}
              />
            ))}

          {!crew && (
            <div className="px-3 text-right text-sm text-muted-foreground">
              Total des équipements{" "}
              <span className="font-medium tabular-nums text-foreground">{formatAmount(total)}</span>
            </div>
          )}
        </div>
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget) && !locked}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Retirer cette ligne ?"
        description={`« ${deleteTarget?.name ?? ""} » sera retiré du projet et de son tableau des coûts.`}
        pending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function lineSelling(values: RowValues): number {
  return (values.quantity || 0) * (values.sellingRate ?? 0);
}

function numberOrNull(event: React.ChangeEvent<HTMLInputElement>): number | null {
  return event.target.value === "" ? null : event.target.valueAsNumber;
}

/** One equipment line, edited in place. Owns no state: values in, every change out. */
function EquipmentRow({
  values,
  equipment,
  disabled,
  taskTitle,
  crew = false,
  needsReview = false,
  onChange,
  onCommit,
  onRemove,
}: {
  values: RowValues;
  equipment: Equipment[];
  disabled?: boolean;
  taskTitle?: string | null;
  crew?: boolean;
  needsReview?: boolean;
  onChange: (values: RowValues) => void;
  onCommit: (values: RowValues) => void;
  onRemove: () => void;
}) {
  const unitLabel = equipmentUnitLabels[values.unit];

  function pick(id: string) {
    if (id === OTHER) {
      const next = { ...values, equipmentId: null };
      onChange(next);
      return;
    }
    const chosen = equipment.find((item) => item.id === id);
    // The equipment's own rates are the starting point; the line can be changed after.
    const next: RowValues = chosen
      ? {
          ...values,
          equipmentId: chosen.id,
          name: chosen.name,
          unit: chosen.unit,
          costRate: chosen.costRate,
          sellingRate: chosen.sellingRate,
        }
      : { ...values, equipmentId: id };
    onChange(next);
    onCommit(next);
  }

  return (
    <div
      className={cn(
        `grid gap-2 rounded-lg border p-3 ${crew ? CREW_GRID : GRID} lg:items-start`,
        needsReview ? "border-destructive/50" : "border-border",
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground lg:sr-only">Équipement</span>
        <Select
          value={values.equipmentId ?? OTHER}
          onValueChange={(value) => value && pick(value)}
          disabled={disabled}
        >
          <SelectTrigger className="w-full" aria-label="Équipement">
            <SelectValue>
              {(value: string) =>
                value === OTHER
                  ? "Autre (saisi à la main)"
                  : (equipment.find((item) => item.id === value)?.name ?? values.name ?? "…")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {equipment.map((item) => (
              <SelectItem key={item.id} value={item.id} disabled={item.status !== "Disponible"}>
                {item.name}
                {item.status !== "Disponible" && <span className="text-muted-foreground"> — indisponible</span>}
              </SelectItem>
            ))}
            <SelectItem value={OTHER}>Autre (saisi à la main)</SelectItem>
          </SelectContent>
        </Select>
        {!values.equipmentId && (
          <Input
            aria-label="Nom de l'équipement"
            placeholder="Nom de l'équipement"
            maxLength={200}
            value={values.name ?? ""}
            disabled={disabled}
            onChange={(event) => onChange({ ...values, name: event.target.value })}
            onBlur={() => onCommit(values)}
          />
        )}
        {taskTitle && <p className="truncate text-xs text-muted-foreground">{taskTitle}</p>}
        {needsReview && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <NeedsReviewDot />
            Saisi à la main, sans prix : à vérifier
          </p>
        )}
      </div>

      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground lg:sr-only">Date</span>
        <Input
          type="date"
          value={values.usedOn ?? ""}
          disabled={disabled}
          onChange={(event) => onChange({ ...values, usedOn: event.target.value || null })}
          onBlur={() => onCommit(values)}
        />
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground lg:sr-only">Quantité ({unitLabel}s)</span>
        <Input
          type="number"
          step="0.25"
          min="0"
          inputMode="decimal"
          className="text-right"
          title={`En ${unitLabel}s`}
          value={values.quantity}
          disabled={disabled}
          onChange={(event) => onChange({ ...values, quantity: event.target.valueAsNumber || 0 })}
          onBlur={() => onCommit(values)}
        />
      </label>

      {!crew && (
        <>
      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground lg:sr-only">Coûtant ($ / {unitLabel})</span>
        <Input
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          className="text-right"
          value={values.costRate ?? ""}
          disabled={disabled}
          onChange={(event) => onChange({ ...values, costRate: numberOrNull(event) })}
          onBlur={() => onCommit(values)}
        />
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground lg:sr-only">Vendant ($ / {unitLabel})</span>
        <Input
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          className="text-right"
          value={values.sellingRate ?? ""}
          disabled={disabled}
          onChange={(event) => onChange({ ...values, sellingRate: numberOrNull(event) })}
          onBlur={() => onCommit(values)}
        />
      </label>

      <div className="flex items-center justify-between gap-2 lg:h-9 lg:justify-end">
        <span className="text-sm font-medium text-muted-foreground lg:sr-only">Total</span>
        <span className="text-sm tabular-nums text-foreground">{formatAmount(lineSelling(values))}</span>
      </div>

        </>
      )}

      <div className="flex items-center justify-end gap-1">
        {values.equipmentId && (
          <Link
            href={`/equipements?id=${values.equipmentId}`}
            aria-label="Voir la fiche de l'équipement"
            title="Voir la fiche de l'équipement"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <ExternalLink />
          </Link>
        )}
        {!disabled && (
          <Button type="button" variant="ghost" size="icon" aria-label="Retirer la ligne" onClick={onRemove}>
            <Trash2 />
          </Button>
        )}
      </div>
    </div>
  );
}
