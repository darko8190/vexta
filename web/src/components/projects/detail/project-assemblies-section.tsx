"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Blocks, ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { SearchInput } from "@/components/layout/search-input";
import {
  formatAssemblyNumber,
  useAssembliesQuery,
  useDeleteProjectAssembly,
  useProjectAssembliesQuery,
  useSaveProjectAssembly,
  type Assembly,
  type ProjectAssemblyLine,
  type ProjectAssemblyValues,
} from "@/hooks/use-assemblies";
import { ApiError } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { matchesSearch } from "@/lib/text-match";

const OTHER = "autre";
const GRID = "lg:grid-cols-[minmax(0,1fr)_140px_90px_110px_110px_110px_76px]";

function toValues(line: ProjectAssemblyLine): ProjectAssemblyValues {
  return {
    assemblyId: line.assemblyId,
    name: line.name,
    quantity: line.quantity,
    unitCost: line.unitCost,
    unitPrice: line.unitPrice,
    installedOn: line.installedOn,
    projectTaskId: line.projectTaskId,
  };
}

function blankValues(taskId?: string): ProjectAssemblyValues {
  return {
    assemblyId: null,
    name: "",
    quantity: 1,
    unitCost: null,
    unitPrice: null,
    installedOn: todayIso(),
    projectTaskId: taskId ?? null,
  };
}

function isSavable(values: ProjectAssemblyValues) {
  return (Boolean(values.assemblyId) || (values.name ?? "").trim() !== "") && values.quantity > 0;
}

function lineTotal(values: ProjectAssemblyValues) {
  return (values.quantity || 0) * (values.unitPrice ?? 0);
}

interface Draft {
  uid: string;
  values: ProjectAssemblyValues;
}

/**
 * The assemblies installed on this job, edited in place: pick the assembly, how many, and its
 * cost and price follow from the assembly. Each line feeds the Assemblages row of the cost table
 * and the invoice generated from the project.
 */
export function ProjectAssembliesSection({
  projectId,
  locked,
  taskId,
}: {
  projectId: string;
  locked?: boolean;
  taskId?: string;
}) {
  const { data, isLoading } = useProjectAssembliesQuery(projectId);
  const { data: catalogue } = useAssembliesQuery();
  const save = useSaveProjectAssembly(projectId);
  const remove = useDeleteProjectAssembly(projectId);

  const [edits, setEdits] = useState<Record<string, ProjectAssemblyValues>>({});
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ProjectAssemblyLine | undefined>(undefined);
  const [search, setSearch] = useState("");

  const sent = useRef<Record<string, string>>({});
  const posting = useRef(new Set<string>());
  const nextUid = useRef(0);

  const lines = (data ?? []).filter(
    (line) => (!taskId || line.projectTaskId === taskId) && matchesSearch(search, line.name, line.projectTaskTitle),
  );
  const assemblies = catalogue ?? [];

  const valuesOf = (line: ProjectAssemblyLine) => edits[line.id] ?? toValues(line);
  const message = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

  async function commitExisting(line: ProjectAssemblyLine, values: ProjectAssemblyValues) {
    if (!isSavable(values)) return;
    const payload = JSON.stringify(values);
    const baseline = sent.current[line.id] ?? JSON.stringify(toValues(line));
    if (payload === baseline) return;
    sent.current[line.id] = payload;
    try {
      await save.mutateAsync({ id: line.id, values });
    } catch (error) {
      delete sent.current[line.id];
      toast.error(message(error, "Impossible d'enregistrer la ligne."));
    }
  }

  async function commitDraft(uid: string, values: ProjectAssemblyValues) {
    if (!isSavable(values) || posting.current.has(uid)) return;
    posting.current.add(uid);
    try {
      await save.mutateAsync({ values });
      setDrafts((previous) => previous.filter((draft) => draft.uid !== uid));
    } catch (error) {
      toast.error(message(error, "Impossible d'ajouter l'assemblage."));
    } finally {
      posting.current.delete(uid);
    }
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
    } catch (error) {
      toast.error(message(error, "Impossible de retirer la ligne."));
    }
  }

  const addButton = locked ? undefined : (
    <Button
      onClick={() => {
        nextUid.current += 1;
        setDrafts((previous) => [...previous, { uid: `draft-${nextUid.current}`, values: blankValues(taskId) }]);
      }}
    >
      <Plus />
      Ajouter un assemblage
    </Button>
  );

  const total =
    lines.reduce((sum, line) => sum + lineTotal(valuesOf(line)), 0) +
    drafts.reduce((sum, draft) => sum + lineTotal(draft.values), 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Assemblages</h2>
          <p className="text-sm text-muted-foreground">Les ensembles préparés d&apos;avance et installés tels quels.</p>
        </div>
        {addButton}
      </div>

      {(data?.length ?? 0) > 0 && (
        <div className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un assemblage…" />
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : lines.length + drafts.length === 0 ? (
        <EmptyState
          icon={Blocks}
          title={search ? "Aucun assemblage ne correspond" : "Aucun assemblage"}
          description="Les assemblages se créent dans Inventaire › Assemblages, puis s'ajoutent ici avec leur quantité."
          action={search ? undefined : addButton}
        />
      ) : (
        <div className="space-y-3">
          <div className={`hidden items-end gap-2 px-3 text-xs font-medium text-muted-foreground lg:grid ${GRID}`}>
            <span>Assemblage</span>
            <span>Date</span>
            <span className="text-right">Qté</span>
            <span className="text-right">Coûtant / unité</span>
            <span className="text-right">Vendant / unité</span>
            <span className="text-right">Total</span>
            <span />
          </div>

          {lines.map((line) => (
            <AssemblyRow
              key={line.id}
              values={valuesOf(line)}
              assemblies={assemblies}
              disabled={locked}
              taskTitle={line.projectTaskTitle}
              onChange={(next) => setEdits((previous) => ({ ...previous, [line.id]: next }))}
              onCommit={(next) => void commitExisting(line, next)}
              onRemove={() => setDeleteTarget(line)}
            />
          ))}

          {!locked &&
            drafts.map((draft) => (
              <AssemblyRow
                key={draft.uid}
                values={draft.values}
                assemblies={assemblies}
                onChange={(next) =>
                  setDrafts((previous) => previous.map((row) => (row.uid === draft.uid ? { ...row, values: next } : row)))
                }
                onCommit={(next) => void commitDraft(draft.uid, next)}
                onRemove={() => setDrafts((previous) => previous.filter((row) => row.uid !== draft.uid))}
              />
            ))}

          <div className="px-3 text-right text-sm text-muted-foreground">
            Total des assemblages{" "}
            <span className="font-medium tabular-nums text-foreground">{formatAmount(total)}</span>
          </div>
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

function numberOrNull(event: React.ChangeEvent<HTMLInputElement>): number | null {
  return event.target.value === "" ? null : event.target.valueAsNumber;
}

function AssemblyRow({
  values,
  assemblies,
  disabled,
  taskTitle,
  onChange,
  onCommit,
  onRemove,
}: {
  values: ProjectAssemblyValues;
  assemblies: Assembly[];
  disabled?: boolean;
  taskTitle?: string | null;
  onChange: (values: ProjectAssemblyValues) => void;
  onCommit: (values: ProjectAssemblyValues) => void;
  onRemove: () => void;
}) {
  function pick(id: string) {
    if (id === OTHER) {
      onChange({ ...values, assemblyId: null });
      return;
    }
    const chosen = assemblies.find((item) => item.id === id);
    const next: ProjectAssemblyValues = chosen
      ? { ...values, assemblyId: chosen.id, name: chosen.name, unitCost: chosen.unitCost, unitPrice: chosen.unitPrice }
      : { ...values, assemblyId: id };
    onChange(next);
    onCommit(next);
  }

  return (
    <div className={`grid gap-2 rounded-lg border border-border p-3 ${GRID} lg:items-start`}>
      <div className="min-w-0 space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground lg:sr-only">Assemblage</span>
        <Select value={values.assemblyId ?? OTHER} onValueChange={(value) => value && pick(value)} disabled={disabled}>
          <SelectTrigger className="w-full" aria-label="Assemblage">
            <SelectValue>
              {(value: string) =>
                value === OTHER
                  ? "Autre (saisi à la main)"
                  : (assemblies.find((item) => item.id === value)?.name ?? values.name ?? "…")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {assemblies.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {formatAssemblyNumber(item.number)} · {item.name}
              </SelectItem>
            ))}
            <SelectItem value={OTHER}>Autre (saisi à la main)</SelectItem>
          </SelectContent>
        </Select>
        {!values.assemblyId && (
          <Input
            aria-label="Nom de l'assemblage"
            placeholder="Nom de l'assemblage"
            maxLength={200}
            value={values.name ?? ""}
            disabled={disabled}
            onChange={(event) => onChange({ ...values, name: event.target.value })}
            onBlur={() => onCommit(values)}
          />
        )}
        {taskTitle && <p className="truncate text-xs text-muted-foreground">{taskTitle}</p>}
      </div>

      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground lg:sr-only">Date</span>
        <Input
          type="date"
          value={values.installedOn ?? ""}
          disabled={disabled}
          onChange={(event) => onChange({ ...values, installedOn: event.target.value || null })}
          onBlur={() => onCommit(values)}
        />
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground lg:sr-only">Quantité</span>
        <Input
          type="number"
          step="1"
          min="0"
          inputMode="decimal"
          className="text-right"
          value={values.quantity}
          disabled={disabled}
          onChange={(event) => onChange({ ...values, quantity: event.target.valueAsNumber || 0 })}
          onBlur={() => onCommit(values)}
        />
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground lg:sr-only">Coûtant / unité</span>
        <Input
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          className="text-right"
          value={values.unitCost ?? ""}
          disabled={disabled}
          onChange={(event) => onChange({ ...values, unitCost: numberOrNull(event) })}
          onBlur={() => onCommit(values)}
        />
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground lg:sr-only">Vendant / unité</span>
        <Input
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          className="text-right"
          value={values.unitPrice ?? ""}
          disabled={disabled}
          onChange={(event) => onChange({ ...values, unitPrice: numberOrNull(event) })}
          onBlur={() => onCommit(values)}
        />
      </label>

      <div className="flex items-center justify-between gap-2 lg:h-9 lg:justify-end">
        <span className="text-sm font-medium text-muted-foreground lg:sr-only">Total</span>
        <span className="text-sm tabular-nums text-foreground">{formatAmount(lineTotal(values))}</span>
      </div>

      <div className="flex items-center justify-end gap-1">
        {values.assemblyId && (
          <Link
            href={`/inventaire?section=assemblages&id=${values.assemblyId}`}
            aria-label="Voir la fiche de l'assemblage"
            title="Voir la fiche de l'assemblage"
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
