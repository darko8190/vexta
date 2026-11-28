"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Pause, Play, Plus, Square, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
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
import {
  useDeleteTimesheet,
  useMyPunchQuery,
  usePunch,
  useSaveTimesheet,
  useTimesheetsQuery,
  type PunchStep,
} from "@/hooks/use-timesheets";
import { useProjectSettingsQuery } from "@/hooks/use-project-settings";
import { ApiError } from "@/lib/api";
import { formatDateOnly, todayIso } from "@/lib/dates";
import { matchesSearch } from "@/lib/text-match";
import type { SaveTimesheetValues, TimesheetEntry } from "@/lib/types";

/** The columns, shared by the headings and every row. Below lg each field carries its label.
 * The office has one more: the hourly rate each line is billed at. */
const CREW_GRID = "lg:grid-cols-[minmax(0,14rem)_150px_110px_110px_minmax(0,1fr)_80px_40px]";
const OFFICE_GRID = "sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-[minmax(0,12rem)_140px_105px_105px_minmax(6rem,1fr)_90px_60px_40px]";

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
    hourlyRate: entry.hourlyRate ?? null,
  };
}

/** A line with hours but no clock times: added on its own by an automatic line. */
function isHoursOnly(entry: TimesheetEntry): boolean {
  return entry.startTime === entry.endTime && entry.startDate === entry.endDate && entry.hours > 0;
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
  const GRID = crew ? CREW_GRID : OFFICE_GRID;
  const { data: projectSettings } = useProjectSettingsQuery();
  const punchMode = projectSettings?.labourMode === "Punch";

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
    // Times left as they were keep the entry's own end date and hours: a punch, or a line of
    // hours with no clock times, is saved on its rate, note or employee alone.
    const sameTimes =
      raw.startDate === entry.startDate && raw.startTime === entry.startTime && raw.endTime === entry.endTime;
    const values = sameTimes ? { ...raw, endDate: entry.endDate } : withEndDate(raw);
    if (!sameTimes && !isSavable(values)) return;
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

  // A running punch counts once it is closed; an hours-only line counts its stored hours.
  const entryHours = (entry: TimesheetEntry) =>
    entry.punchState && entry.punchState !== "Aucun"
      ? 0
      : !edits[entry.id]
        ? entry.hours
        : hoursOf(withEndDate(valuesOf(entry)));
  const totalHours =
    entries.reduce((sum, entry) => sum + entryHours(entry), 0) +
    drafts.reduce((sum, draft) => sum + hoursOf(withEndDate(draft.values)), 0);

  // In punch mode the crew uses the clock; the office can still type a line in.
  const addButton = locked || (punchMode && crew) ? undefined : (
    <Button variant={punchMode ? "outline" : "default"} onClick={addDraft}>
      <Plus />
      {punchMode ? "Ajouter à la main" : "Ajouter des heures"}
    </Button>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Main-d&apos;œuvre</h2>
          <p className="text-sm text-muted-foreground">
            Les heures pointées sur ce projet et ses tâches, arrondies au quart d&apos;heure. Ce sont elles qui se facturent.
          </p>
        </div>
        {addButton}
      </div>

      {punchMode && !locked && <PunchPanel projectId={projectId} taskId={taskId} entries={data ?? []} />}

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
          title="Main-d'œuvre indisponible"
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
          <div className={`hidden items-end gap-2 px-3 text-xs font-medium text-muted-foreground ${crew ? "lg:grid" : "2xl:grid"} ${GRID}`}>
            <span>Employé</span>
            <span>Date</span>
            <span>Début</span>
            <span>Fin</span>
            <span>Note</span>
            {!crew && <span className="text-right">Taux ($/h)</span>}
            <span className="text-right">Heures</span>
            <span />
          </div>

          {entries.map((entry) => (
            <TimesheetRow
              key={entry.id}
              grid={GRID}
              showRate={!crew}
              values={valuesOf(entry)}
              fixedHours={!edits[entry.id] ? entry.hours : undefined}
              punchState={entry.punchState}
              disabled={locked || (entry.punchState != null && entry.punchState !== "Aucun")}
              removedEmployeeName={
                entry.employeeId
                  ? crew
                    ? (entry.employeeName ?? "—")
                    : null
                  : isHoursOnly(entry)
                    ? crew
                      ? "À assigner"
                      : null
                    : "Employé retiré"
              }
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
                grid={GRID}
                showRate={!crew}
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
  grid,
  showRate,
  values,
  fixedHours,
  punchState,
  disabled,
  removedEmployeeName,
  taskTitle,
  onChange,
  onCommit,
  onRemove,
}: {
  grid: string;
  showRate: boolean;
  values: SaveTimesheetValues;
  /** The stored hours of a line with no clock times. */
  fixedHours?: number;
  punchState?: TimesheetEntry["punchState"];
  disabled?: boolean;
  removedEmployeeName?: string | null;
  taskTitle?: string | null;
  onChange: (values: SaveTimesheetValues) => void;
  onCommit: (values: SaveTimesheetValues) => void;
  onRemove: () => void;
}) {
  // The office's row has one more column and lays out in a row only on the widest screens.
  const srOnly = showRate ? "2xl:sr-only" : "lg:sr-only";
  const running = punchState === "EnCours" || punchState === "EnPause";
  const hours = fixedHours ?? hoursOf(withEndDate(values));
  const crossesMidnight =
    !running && fixedHours === undefined && values.startTime && values.endTime && values.endTime <= values.startTime;

  return (
    <div className={`grid gap-2 rounded-lg border border-border p-3 ${grid} lg:items-start`}>
      <div className="min-w-0 space-y-1">
        <span className={`text-xs font-medium text-muted-foreground ${srOnly}`}>Employé</span>
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
        {running && (
          <Badge variant={punchState === "EnPause" ? "outline" : "secondary"}>
            {punchState === "EnPause" ? "En pause" : "Punch en cours"}
          </Badge>
        )}
      </div>

      <label className="space-y-1">
        <span className={`text-xs font-medium text-muted-foreground ${srOnly}`}>Date</span>
        <Input
          type="date"
          value={values.startDate}
          disabled={disabled}
          onChange={(event) => onChange({ ...values, startDate: event.target.value })}
          onBlur={() => onCommit(values)}
        />
      </label>

      <label className="space-y-1">
        <span className={`text-xs font-medium text-muted-foreground ${srOnly}`}>Début</span>
        <Input
          type="time"
          value={values.startTime}
          disabled={disabled}
          onChange={(event) => onChange({ ...values, startTime: event.target.value })}
          onBlur={() => onCommit(values)}
        />
      </label>

      <label className="space-y-1">
        <span className={`text-xs font-medium text-muted-foreground ${srOnly}`}>Fin</span>
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
        <span className={`text-xs font-medium text-muted-foreground ${srOnly}`}>Note</span>
        <Input
          value={values.note ?? ""}
          maxLength={500}
          disabled={disabled}
          onChange={(event) => onChange({ ...values, note: event.target.value || null })}
          onBlur={() => onCommit(values)}
        />
      </label>

      {showRate && (
        <label className="space-y-1">
          <span className={`text-xs font-medium text-muted-foreground ${srOnly}`}>Taux ($/h)</span>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            className="text-right tabular-nums"
            value={values.hourlyRate ?? ""}
            placeholder="Taux"
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...values, hourlyRate: event.target.value === "" ? null : Number(event.target.value) })
            }
            onBlur={() => onCommit(values)}
          />
        </label>
      )}

      <div className="flex items-center justify-between gap-2 lg:h-9 lg:justify-end">
        <span className={`text-sm font-medium text-muted-foreground ${srOnly}`}>Heures</span>
        <span className="text-sm font-medium tabular-nums text-foreground">{running ? "—" : formatHours(hours)}</span>
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

/** Seconds as « 1 h 05 min 12 s ». */
function elapsedLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return `${h} h ${String(m).padStart(2, "0")} min ${String(sec).padStart(2, "0")} s`;
}

/** The time worked so far on a punch, pauses taken off. */
function workedSeconds(entry: TimesheetEntry, now: number): number {
  if (!entry.punchStartedAt) return 0;
  const end = entry.punchState === "EnPause" && entry.pausedAt ? new Date(entry.pausedAt).getTime() : now;
  return (end - new Date(entry.punchStartedAt).getTime()) / 1000 - (entry.pausedSeconds ?? 0);
}

/**
 * The clock, in punch mode: Commencer, Pause, Continuer, Terminer. The punch is mine, on this
 * job — and on this task when the section is opened from one. One punch at a time per person.
 */
function PunchPanel({ projectId, taskId, entries }: { projectId: string; taskId?: string; entries: TimesheetEntry[] }) {
  const { data: mine, isLoading } = useMyPunchQuery(projectId);
  const punch = usePunch(projectId);
  const [now, setNow] = useState(() => Date.now());
  const running = mine?.punchState === "EnCours";

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const elsewhere = mine && !entries.some((entry) => entry.id === mine.id);

  async function step(next: PunchStep) {
    try {
      await punch.mutateAsync({ step: next, id: mine?.id, projectTaskId: taskId ?? null });
      setNow(Date.now());
      if (next === "terminer") toast.success("Punch terminé.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Le punch n'a pas pu être enregistré.");
    }
  }

  if (isLoading) return <Skeleton className="mb-4 h-20 w-full" />;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
      <div>
        <p className="text-sm font-medium text-foreground">
          {!mine
            ? "Aucun punch en cours"
            : elsewhere
              ? "Vous avez un punch en cours sur un autre projet"
              : mine.punchState === "EnPause"
                ? "En pause"
                : "Punch en cours"}
        </p>
        {mine && !elsewhere && (
          <p className="text-2xl font-semibold tabular-nums text-foreground" aria-live="polite">
            {elapsedLabel(workedSeconds(mine, now))}
          </p>
        )}
      </div>
      {!elsewhere && (
        <div className="flex flex-wrap gap-2">
          {!mine && (
            <Button onClick={() => void step("commencer")} disabled={punch.isPending}>
              {punch.isPending ? <Spinner /> : <Play />}
              Commencer
            </Button>
          )}
          {mine?.punchState === "EnCours" && (
            <Button variant="outline" onClick={() => void step("pause")} disabled={punch.isPending}>
              <Pause />
              Mettre en pause
            </Button>
          )}
          {mine?.punchState === "EnPause" && (
            <Button variant="outline" onClick={() => void step("continuer")} disabled={punch.isPending}>
              <Play />
              Continuer
            </Button>
          )}
          {mine && (
            <Button onClick={() => void step("terminer")} disabled={punch.isPending}>
              {punch.isPending ? <Spinner /> : <Square />}
              Terminer
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
