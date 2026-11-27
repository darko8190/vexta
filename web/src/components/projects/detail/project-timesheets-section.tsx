"use client";

import { useRef, useState } from "react";
import { Clock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { SearchInput } from "@/components/layout/search-input";
import { EmployeePicker } from "@/components/team/employee-picker";
import { useIsCrewView } from "@/hooks/use-can-create";
import { formatHours, quarterHoursBetween } from "@/components/projects/detail/timesheet-form-sheet";
import { useDeleteTimesheet, useSaveTimesheet, useTimesheetsQuery } from "@/hooks/use-timesheets";
import { ApiError } from "@/lib/api";
import { formatDateOnly, todayIso } from "@/lib/dates";
import { matchesSearch } from "@/lib/text-match";
import type { SaveTimesheetValues, TimesheetEntry } from "@/lib/types";

/** The columns, shared by the headings and every row. Below lg each field carries its label. */
const GRID = "lg:grid-cols-[minmax(0,14rem)_150px_110px_110px_minmax(0,1fr)_80px_40px]";

/** The day after, for a shift whose end is earlier on the clock than its start. */
function nextDay(date: string): string {
  const day = new Date(`${date}T12:00`);
  day.setDate(day.getDate() + 1);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

/** The end date follows from the start: the same day, or the next when the shift crosses midnight. */
function withEndDate(values: SaveTimesheetValues): SaveTimesheetValues {
  if (!values.startDate || !values.startTime || !values.endTime) return { ...values, endDate: values.startDate };
  return { ...values, endDate: values.endTime <= values.startTime ? nextDay(values.startDate) : values.startDate };
}

function toValues(entry: TimesheetEntry): SaveTimesheetValues {
  return {
    employeeId: entry.employeeId ?? "",
    startDate: entry.startDate,
    endDate: entry.endDate,
    startTime: entry.startTime,
    endTime: entry.endTime,
    note: entry.note,
    projectTaskId: entry.projectTaskId,
  };
}

function blankValues(taskId?: string, self = false): SaveTimesheetValues {
  const today = todayIso();
  return {
    employeeId: self ? SELF_EMPLOYEE : "",
    startDate: today,
    endDate: today,
    startTime: "07:00",
    endTime: "15:30",
    note: null,
    projectTaskId: taskId ?? null,
  };
}

function hoursOf(values: SaveTimesheetValues): number {
  return quarterHoursBetween(values.startDate, values.startTime, values.endDate, values.endTime) ?? 0;
}

/** The crew punches its own hours: the API files them under whoever is signed in. */
export const SELF_EMPLOYEE = "00000000-0000-0000-0000-000000000000";

function isSavable(values: SaveTimesheetValues): boolean {
  return Boolean(values.employeeId && values.startDate && values.startTime && values.endTime) && hoursOf(values) > 0;
}

interface Draft {
  uid: string;
  values: SaveTimesheetValues;
}

/**
 * The hours worked on one project, as lines edited in place: who, which day, from when to when.
 * A new line is saved as soon as it names somebody and a shift that lasts; a saved line is
 * written again when a field is left.
 *
 * `locked` is the project being billed: the fields read but no longer write.
 */
export function ProjectTimesheetsSection({
  projectId,
  locked,
  taskId,
}: {
  projectId: string;
  locked?: boolean;
  /** Shows only what is attached to this task, and files new rows against it. */
  taskId?: string;
}) {
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } = useTimesheetsQuery(projectId);
  const save = useSaveTimesheet(projectId);
  const remove = useDeleteTimesheet(projectId);
  // The crew punches its own hours: no one to choose.
  const crew = useIsCrewView();

  const [edits, setEdits] = useState<Record<string, SaveTimesheetValues>>({});
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<TimesheetEntry | undefined>(undefined);
  const [search, setSearch] = useState("");

  const sent = useRef<Record<string, string>>({});
  const posting = useRef(new Set<string>());
  const nextUid = useRef(0);

  const entries = (data ?? []).filter(
    (entry) =>
      (!taskId || entry.projectTaskId === taskId) &&
      matchesSearch(search, entry.employeeName, entry.note, entry.projectTaskTitle, entry.startDate),
  );

  function valuesOf(entry: TimesheetEntry): SaveTimesheetValues {
    return edits[entry.id] ?? toValues(entry);
  }

  function message(error: unknown, fallback: string) {
    return error instanceof ApiError ? error.message : fallback;
  }

  async function commitExisting(entry: TimesheetEntry, raw: SaveTimesheetValues) {
    const values = withEndDate(raw);
    if (!isSavable(values)) return;
    const payload = JSON.stringify(values);
    const baseline = sent.current[entry.id] ?? JSON.stringify(toValues(entry));
    if (payload === baseline) return;
    sent.current[entry.id] = payload;
    try {
      await save.mutateAsync({ id: entry.id, values });
    } catch (error) {
      delete sent.current[entry.id];
      toast.error(message(error, "Impossible d'enregistrer ces heures."));
    }
  }

  async function commitDraft(uid: string, raw: SaveTimesheetValues) {
    const values = withEndDate(raw);
    if (!isSavable(values) || posting.current.has(uid)) return;
    posting.current.add(uid);
    try {
      await save.mutateAsync({ values });
      setDrafts((previous) => previous.filter((draft) => draft.uid !== uid));
    } catch (error) {
      toast.error(message(error, "Impossible d'ajouter ces heures."));
    } finally {
      posting.current.delete(uid);
    }
  }

  function addDraft() {
    nextUid.current += 1;
    setDrafts((previous) => [...previous, { uid: `draft-${nextUid.current}`, values: blankValues(taskId, crew) }]);
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
      toast.success("Heures supprimées.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(message(error, "Impossible de supprimer ces heures."));
    }
  }

  const totalHours =
    entries.reduce((sum, entry) => sum + hoursOf(withEndDate(valuesOf(entry))), 0) +
    drafts.reduce((sum, draft) => sum + hoursOf(withEndDate(draft.values)), 0);

  const addButton = locked ? undefined : (
    <Button onClick={addDraft}>
      <Plus />
      Ajouter des heures
    </Button>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Poinçons</h2>
          <p className="text-sm text-muted-foreground">
            Les heures pointées sur ce projet et ses tâches, arrondies au quart d&apos;heure. Ce sont elles qui se facturent.
          </p>
        </div>
        {addButton}
      </div>

      {(data?.length ?? 0) > 0 && (
        <div className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un employé, une note…" />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        <LoadErrorState
          error={loadError}
          title="Poinçons indisponibles"
          fallback="Les heures de ce projet n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : entries.length + drafts.length === 0 ? (
        <EmptyState
          icon={Clock}
          title={search ? "Aucune heure ne correspond" : "Aucune heure inscrite"}
          description="Le quart de chacun, du matin au départ du chantier. Le total est arrondi au quart d'heure, comme sur la facture."
          action={search ? undefined : addButton}
        />
      ) : (
        <div className="space-y-3">
          <div className={`hidden items-end gap-2 px-3 text-xs font-medium text-muted-foreground lg:grid ${GRID}`}>
            <span>Employé</span>
            <span>Date</span>
            <span>Début</span>
            <span>Fin</span>
            <span>Note</span>
            <span className="text-right">Heures</span>
            <span />
          </div>

          {entries.map((entry) => (
            <TimesheetRow
              key={entry.id}
              values={valuesOf(entry)}
              disabled={locked}
              removedEmployeeName={entry.employeeId ? (crew ? (entry.employeeName ?? "—") : null) : "Employé retiré"}
              taskTitle={entry.projectTaskTitle}
              onChange={(next) => setEdits((previous) => ({ ...previous, [entry.id]: next }))}
              onCommit={(next) => void commitExisting(entry, next)}
              onRemove={() => setDeleteTarget(entry)}
            />
          ))}

          {!locked &&
            drafts.map((draft) => (
              <TimesheetRow
                key={draft.uid}
                values={draft.values}
                removedEmployeeName={crew ? "Moi" : null}
                onChange={(next) =>
                  setDrafts((previous) => previous.map((row) => (row.uid === draft.uid ? { ...row, values: next } : row)))
                }
                onCommit={(next) => void commitDraft(draft.uid, next)}
                onRemove={() => setDrafts((previous) => previous.filter((row) => row.uid !== draft.uid))}
              />
            ))}

          <div className="px-3 text-right text-sm text-muted-foreground">
            Total des heures{" "}
            <span className="font-semibold tabular-nums text-foreground">{formatHours(totalHours)}</span>
          </div>
        </div>
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget) && !locked}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer ces heures ?"
        description={`Le quart de ${deleteTarget?.employeeName ?? "cet employé"} du ${formatDateOnly(deleteTarget?.startDate)} sera retiré du projet.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}

/** One shift, edited in place. Owns no state: values in, every change out. */
function TimesheetRow({
  values,
  disabled,
  removedEmployeeName,
  taskTitle,
  onChange,
  onCommit,
  onRemove,
}: {
  values: SaveTimesheetValues;
  disabled?: boolean;
  removedEmployeeName?: string | null;
  taskTitle?: string | null;
  onChange: (values: SaveTimesheetValues) => void;
  onCommit: (values: SaveTimesheetValues) => void;
  onRemove: () => void;
}) {
  const hours = hoursOf(withEndDate(values));
  const crossesMidnight = values.startTime && values.endTime && values.endTime <= values.startTime;

  return (
    <div className={`grid gap-2 rounded-lg border border-border p-3 ${GRID} lg:items-start`}>
      <div className="min-w-0 space-y-1">
        <span className="text-xs font-medium text-muted-foreground lg:sr-only">Employé</span>
        {removedEmployeeName ? (
          <p className="flex h-9 items-center text-sm text-muted-foreground">{removedEmployeeName}</p>
        ) : disabled ? (
          <div className="pointer-events-none opacity-70">
            <EmployeePicker value={values.employeeId} onChange={() => {}} />
          </div>
        ) : (
          <EmployeePicker
            value={values.employeeId}
            onChange={(employeeId) => {
              const next = { ...values, employeeId };
              onChange(next);
              onCommit(next);
            }}
          />
        )}
        {taskTitle && <p className="truncate text-xs text-muted-foreground">{taskTitle}</p>}
      </div>

      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground lg:sr-only">Date</span>
        <Input
          type="date"
          value={values.startDate}
          disabled={disabled}
          onChange={(event) => onChange({ ...values, startDate: event.target.value })}
          onBlur={() => onCommit(values)}
        />
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground lg:sr-only">Début</span>
        <Input
          type="time"
          value={values.startTime}
          disabled={disabled}
          onChange={(event) => onChange({ ...values, startTime: event.target.value })}
          onBlur={() => onCommit(values)}
        />
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground lg:sr-only">Fin</span>
        <Input
          type="time"
          value={values.endTime}
          disabled={disabled}
          onChange={(event) => onChange({ ...values, endTime: event.target.value })}
          onBlur={() => onCommit(values)}
        />
        {crossesMidnight && <span className="block text-xs text-muted-foreground">le lendemain</span>}
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground lg:sr-only">Note</span>
        <Input
          value={values.note ?? ""}
          maxLength={500}
          disabled={disabled}
          onChange={(event) => onChange({ ...values, note: event.target.value || null })}
          onBlur={() => onCommit(values)}
        />
      </label>

      <div className="flex items-center justify-between gap-2 lg:h-9 lg:justify-end">
        <span className="text-sm font-medium text-muted-foreground lg:sr-only">Heures</span>
        <span className="text-sm font-medium tabular-nums text-foreground">{formatHours(hours)}</span>
      </div>

      <div className="flex items-center justify-end">
        {!disabled && (
          <Button type="button" variant="ghost" size="icon" aria-label="Supprimer ces heures" onClick={onRemove}>
            <Trash2 />
          </Button>
        )}
      </div>
    </div>
  );
}
