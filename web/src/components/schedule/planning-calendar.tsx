"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  FolderKanban,
  Keyboard,
  Plus,
  Rows3,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { ShiftSheet } from "@/components/hr/employee/schedule-section";
import { EmployeeMultiSelect } from "@/components/team/employee-multi-select";
import { useDecideLeave, usePlanningQuery, useScheduleBatch } from "@/hooks/use-employee-file";
import { ApiError } from "@/lib/api";
import { formatDateOnly, todayIso } from "@/lib/dates";
import { leaveKindLabels } from "@/lib/labels";
import { formatProjectNumber } from "@/lib/types";
import type {
  PlanningLeave,
  PlanningProject,
  SaveScheduleShiftValues,
  ScheduleBatch,
  ScheduleShift,
} from "@/lib/types";
import { cn } from "@/lib/utils";

// ---- Dates and times, as the API writes them: "2026-11-23", "07:30:00" ----

function toIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parse(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function addDays(iso: string, days: number): string {
  const date = parse(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}

function mondayOf(iso: string): string {
  const date = parse(iso);
  return addDays(iso, -((date.getDay() + 6) % 7));
}

function monthBounds(iso: string): [string, string] {
  const date = parse(iso);
  return [
    toIso(new Date(date.getFullYear(), date.getMonth(), 1)),
    toIso(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  ];
}

function datesFrom(start: string, end: string): string[] {
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

function timeOf(minutes: number): string {
  const clamped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}:00`;
}

/** The end in minutes from midnight of the shift's day: past 24 h for a night shift. */
function endMinutesOf(shift: { startTime: string; endTime: string }): number {
  const start = minutesOf(shift.startTime);
  const end = minutesOf(shift.endTime);
  return end <= start ? end + 1440 : end;
}

const hoursFormat = (hours: number) => `${hours.toLocaleString("fr-CA", { maximumFractionDigits: 2 })} h`;

type Period = "jour" | "semaine" | "mois";
type View = "employes" | "agenda";

const periodLabels: Record<Period, string> = { jour: "Jour", semaine: "Semaine", mois: "Mois" };

function boundsOf(period: Period, anchor: string): [string, string] {
  if (period === "jour") return [anchor, anchor];
  if (period === "semaine") {
    const monday = mondayOf(anchor);
    return [monday, addDays(monday, 6)];
  }
  return monthBounds(anchor);
}

function moveAnchor(period: Period, anchor: string, step: number): string {
  if (period === "jour") return addDays(anchor, step);
  if (period === "semaine") return addDays(anchor, step * 7);
  const date = parse(anchor);
  return toIso(new Date(date.getFullYear(), date.getMonth() + step, 1));
}

function periodTitle(period: Period, start: string, end: string): string {
  if (period === "jour") {
    return parse(start).toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  if (period === "mois") return parse(start).toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
  return `Semaine du ${formatDateOnly(start)} au ${formatDateOnly(end)}`;
}

// ---- Colours: one per project, so a site reads across the grid ----

const tones = [
  "border-sky-500/40 bg-sky-500/10",
  "border-violet-500/40 bg-violet-500/10",
  "border-emerald-500/40 bg-emerald-500/10",
  "border-amber-500/40 bg-amber-500/10",
  "border-rose-500/40 bg-rose-500/10",
  "border-teal-500/40 bg-teal-500/10",
];

function toneOf(projectId: string | null): string {
  if (!projectId) return "border-border bg-muted/60";
  let hash = 0;
  for (const char of projectId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return tones[Math.abs(hash) % tones.length];
}

function valuesOf(shift: ScheduleShift): SaveScheduleShiftValues {
  return {
    employeeId: shift.employeeId,
    projectId: shift.projectId,
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    note: shift.note,
  };
}

/** What is being dragged: shifts already planned, or a project to plan. */
type Drag =
  | { kind: "shifts"; ids: string[]; grabOffset: number }
  | { kind: "project"; id: string };

// The drag travels in the browser's own drag data, typed so a drop target can tell a shift
// from a project while it is still being hovered (the data itself is only readable on drop).
const SHIFT_TYPE = "application/x-vexta-shifts";
const PROJECT_TYPE = "application/x-vexta-project";

function writeDrag(event: React.DragEvent, drag: Drag) {
  event.dataTransfer.setData(drag.kind === "shifts" ? SHIFT_TYPE : PROJECT_TYPE, JSON.stringify(drag));
  event.dataTransfer.setData("text/plain", drag.kind === "shifts" ? drag.ids.join(",") : drag.id);
}

function dragKindOf(event: React.DragEvent): Drag["kind"] | null {
  const types = Array.from(event.dataTransfer.types);
  if (types.includes(SHIFT_TYPE)) return "shifts";
  if (types.includes(PROJECT_TYPE)) return "project";
  return null;
}

function readDrag(event: React.DragEvent): Drag | null {
  const raw = event.dataTransfer.getData(SHIFT_TYPE) || event.dataTransfer.getData(PROJECT_TYPE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Drag;
  } catch {
    return null;
  }
}

/** The minutes per pixel row of the agenda, and how far a drag snaps. */
const HOUR_HEIGHT = 48;
const SNAP = 15;

/**
 * The crew's calendar: who works where, day by day, with the leaves on it and the open projects
 * beside it to plan.
 *
 * Two ways to read the same shifts: one row per person (to spread the crew), or the hours of the
 * day as in an agenda (to read one person's or one team's day). Shifts are dragged to another
 * day or person, copied with Alt or Ctrl held, copied and pasted with the keyboard. Every change
 * goes to the API in one save, and the last ones can be undone.
 */
export function PlanningCalendar({ canEdit, employeeId }: { canEdit: boolean; employeeId?: string }) {
  // One person's calendar (« Mon horaire ») reads best as an agenda.
  const [view, setView] = useState<View>(employeeId ? "agenda" : "employes");
  const [period, setPeriod] = useState<Period>("semaine");
  const [anchor, setAnchor] = useState(() => todayIso());
  const [teamId, setTeamId] = useState("");
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [projectFilter, setProjectFilter] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [clipboard, setClipboard] = useState<ScheduleShift[]>([]);
  const [target, setTarget] = useState<{ employeeId?: string; date: string; minutes?: number } | null>(null);
  const [undoStack, setUndoStack] = useState<{ label: string; batch: ScheduleBatch }[]>([]);
  const [sheet, setSheet] = useState<
    { shift?: ScheduleShift; employeeId?: string; projectId?: string; date: string } | null
  >(null);
  const [leaveOpen, setLeaveOpen] = useState<PlanningLeave | null>(null);
  const [resizing, setResizing] = useState<{ id: string; end: number } | null>(null);

  const [start, end] = boundsOf(period, anchor);
  const days = useMemo(() => datesFrom(start, end), [start, end]);
  const { data, isLoading, isError, error, refetch, isFetching } = usePlanningQuery({
    start,
    end,
    teamId: teamId || undefined,
    employeeIds: employeeId ? [employeeId] : employeeIds,
  });
  const batch = useScheduleBatch();
  const decide = useDecideLeave();

  const employees = useMemo(() => data?.employees ?? [], [data]);
  const allShifts = useMemo(() => data?.shifts ?? [], [data]);
  const shifts = useMemo(
    () => (projectFilter ? allShifts.filter((shift) => shift.projectId === projectFilter) : allShifts),
    [allShifts, projectFilter],
  );
  const leaves = useMemo(() => data?.leaves ?? [], [data]);
  const projects = useMemo(() => data?.projects ?? [], [data]);
  const byId = useMemo(() => new Map(allShifts.map((shift) => [shift.id, shift])), [allShifts]);
  const today = todayIso();

  // ---- What is wrong with a shift: a leave the same day, or two shifts on top of each other ----

  const leavesOn = (employeeId: string, date: string) =>
    leaves.filter((leave) => leave.employeeId === employeeId && leave.startDate <= date && leave.endDate >= date);

  const conflicts = useMemo(() => {
    const problems = new Map<string, string>();
    const groups = new Map<string, ScheduleShift[]>();
    for (const shift of allShifts) {
      const key = `${shift.employeeId}|${shift.date}`;
      groups.set(key, [...(groups.get(key) ?? []), shift]);
    }
    for (const group of groups.values()) {
      for (const shift of group) {
        const overlaps = group.some(
          (other) =>
            other.id !== shift.id &&
            minutesOf(other.startTime) < endMinutesOf(shift) &&
            minutesOf(shift.startTime) < endMinutesOf(other),
        );
        if (overlaps) problems.set(shift.id, "Chevauche un autre quart de la même personne.");
      }
    }
    for (const shift of allShifts) {
      const leave = leaves.find(
        (item) => item.employeeId === shift.employeeId && item.startDate <= shift.date && item.endDate >= shift.date,
      );
      if (leave) {
        problems.set(
          shift.id,
          `${leave.status === "Approuve" ? "En congé" : "Congé demandé"} ce jour-là (${leaveKindLabels[leave.kind]}).`,
        );
      }
    }
    return problems;
  }, [allShifts, leaves]);

  // ---- Saving, and undoing what was saved ----

  async function apply(change: ScheduleBatch, label: string, record = true) {
    const before = new Map(byId);
    try {
      const result = await batch.mutateAsync(change);
      if (record) {
        const inverse: ScheduleBatch = {
          delete: result.createdIds,
          update: change.update
            ?.map((item) => before.get(item.id))
            .filter((shift): shift is ScheduleShift => Boolean(shift))
            .map((shift) => ({ id: shift.id, shift: valuesOf(shift) })),
          create: change.delete
            ?.map((id) => before.get(id))
            .filter((shift): shift is ScheduleShift => Boolean(shift))
            .map(valuesOf),
        };
        setUndoStack((stack) => [...stack.slice(-19), { label, batch: inverse }]);
      }
      toast.success(label);
      return result;
    } catch (failure) {
      toast.error(failure instanceof ApiError ? failure.message : "Impossible d'enregistrer l'horaire.");
      return null;
    }
  }

  async function undo() {
    const last = undoStack.at(-1);
    if (!last) return;
    setUndoStack((stack) => stack.slice(0, -1));
    const clean: ScheduleBatch = {
      create: last.batch.create?.length ? last.batch.create : undefined,
      update: last.batch.update?.length ? last.batch.update : undefined,
      delete: last.batch.delete?.length ? last.batch.delete : undefined,
    };
    if (!clean.create && !clean.update && !clean.delete) return;
    await apply(clean, `Annulé : ${last.label.toLowerCase()}`, false);
  }

  /** Shifts moved or copied by some days, to another person when they all belonged to one. */
  async function shiftAll(
    source: ScheduleShift[],
    options: { days: number; employeeId?: string; minutes?: number; copy: boolean },
  ) {
    if (source.length === 0) return;
    const oneOwner = new Set(source.map((shift) => shift.employeeId)).size === 1;
    const moved = source.map((shift) => {
      const values = valuesOf(shift);
      const length = endMinutesOf(shift) - minutesOf(shift.startTime);
      const begin = minutesOf(shift.startTime) + (options.minutes ?? 0);
      return {
        id: shift.id,
        shift: {
          ...values,
          date: addDays(shift.date, options.days),
          employeeId: oneOwner && options.employeeId ? options.employeeId : values.employeeId,
          startTime: options.minutes ? timeOf(begin) : values.startTime,
          endTime: options.minutes ? timeOf(begin + length) : values.endTime,
        },
      };
    });
    const unchanged = moved.every((item, index) => {
      const original = source[index];
      return (
        item.shift.date === original.date &&
        item.shift.employeeId === original.employeeId &&
        item.shift.startTime === original.startTime
      );
    });
    if (unchanged && !options.copy) return;

    const count = source.length > 1 ? `${source.length} quarts` : "Quart";
    if (options.copy) {
      const result = await apply({ create: moved.map((item) => item.shift) }, `${count} copié${source.length > 1 ? "s" : ""}.`);
      if (result) setSelected(new Set(result.createdIds));
    } else {
      await apply({ update: moved }, `${count} déplacé${source.length > 1 ? "s" : ""}.`);
    }
  }

  function selectedShifts(): ScheduleShift[] {
    return [...selected].map((id) => byId.get(id)).filter((shift): shift is ScheduleShift => Boolean(shift));
  }

  function copySelection() {
    const chosen = selectedShifts();
    if (chosen.length === 0) return;
    setClipboard(chosen);
    toast.success(chosen.length > 1 ? `${chosen.length} quarts copiés.` : "Quart copié.", {
      description: "Cliquez une case, puis Ctrl+V.",
    });
  }

  async function paste() {
    if (clipboard.length === 0) return;
    if (!target) {
      toast.info("Cliquez d'abord la case où coller.");
      return;
    }
    const first = clipboard.reduce((min, shift) => (shift.date < min ? shift.date : min), clipboard[0].date);
    await shiftAll(clipboard, {
      days: daysBetween(first, target.date),
      employeeId: target.employeeId,
      copy: true,
    });
  }

  async function removeSelection() {
    const chosen = selectedShifts();
    if (chosen.length === 0) return;
    const done = await apply(
      { delete: chosen.map((shift) => shift.id) },
      chosen.length > 1 ? `${chosen.length} quarts retirés.` : "Quart retiré.",
    );
    if (done) setSelected(new Set());
  }

  async function copyPeriod() {
    const step = period === "jour" ? 1 : 7;
    if (shifts.length === 0) {
      toast.info("Rien à copier sur cette période.");
      return;
    }
    await shiftAll(shifts, { days: step, copy: true });
    setAnchor(moveAnchor(period, anchor, 1));
  }

  async function planProject(project: PlanningProject, employeeId: string | undefined, date: string, minutes?: number) {
    const owner = employeeId ?? (employees.length === 1 ? employees[0].id : undefined);
    if (!owner) {
      setSheet({ projectId: project.id, date });
      return;
    }
    const begin = minutes ?? 7 * 60;
    await apply(
      {
        create: [
          {
            employeeId: owner,
            projectId: project.id,
            date,
            startTime: timeOf(begin),
            endTime: timeOf(Math.min(begin + 9 * 60, 24 * 60 - 1)),
            note: null,
          },
        ],
      },
      `${formatProjectNumber(project.number)} planifié.`,
    );
  }

  // ---- Keyboard ----

  useEffect(() => {
    if (!canEdit) return;
    function onKey(event: KeyboardEvent) {
      const element = event.target as HTMLElement | null;
      if (element && (element.closest("input, textarea, select, [contenteditable=true]") || element.closest("[role=dialog]"))) {
        return;
      }
      if (sheet || leaveOpen) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === "c") {
        if (selected.size === 0) return;
        event.preventDefault();
        copySelection();
      } else if (mod && key === "v") {
        event.preventDefault();
        void paste();
      } else if (mod && key === "d") {
        if (selected.size === 0) return;
        event.preventDefault();
        void shiftAll(selectedShifts(), { days: 1, copy: true });
      } else if (mod && key === "z") {
        event.preventDefault();
        void undo();
      } else if (key === "delete" || key === "backspace") {
        if (selected.size === 0) return;
        event.preventDefault();
        void removeSelection();
      } else if (key === "escape") {
        setSelected(new Set());
        setTarget(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- Pointer: select, drag, drop ----

  function onShiftClick(event: React.MouseEvent, shift: ScheduleShift) {
    event.stopPropagation();
    if (!canEdit) return;
    setTarget({ employeeId: shift.employeeId, date: shift.date });
    setSelected((current) => {
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        const next = new Set(current);
        if (next.has(shift.id)) next.delete(shift.id);
        else next.add(shift.id);
        return next;
      }
      return new Set([shift.id]);
    });
  }

  function onShiftDragStart(event: React.DragEvent, shift: ScheduleShift) {
    if (!canEdit) return;
    const ids = selected.has(shift.id) ? [...selected] : [shift.id];
    if (!selected.has(shift.id)) setSelected(new Set([shift.id]));
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const grabOffset = ((event.clientY - rect.top) / HOUR_HEIGHT) * 60;
    writeDrag(event, { kind: "shifts", ids, grabOffset });
    event.dataTransfer.effectAllowed = "copyMove";
  }

  function onProjectDragStart(event: React.DragEvent, project: PlanningProject) {
    writeDrag(event, { kind: "project", id: project.id });
    event.dataTransfer.effectAllowed = "copy";
  }

  function onCellDragOver(event: React.DragEvent) {
    const kind = dragKindOf(event);
    if (!canEdit || !kind) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = kind === "project" || event.altKey || event.ctrlKey || event.metaKey ? "copy" : "move";
  }

  /** `minutes`: where in the day it was dropped, for the agenda; left out on a row of days. */
  async function onCellDrop(event: React.DragEvent, cell: { employeeId?: string; date: string; minutes?: number }) {
    event.preventDefault();
    const drag = readDrag(event);
    if (!canEdit || !drag) return;
    setTarget({ employeeId: cell.employeeId, date: cell.date });

    if (drag.kind === "project") {
      const project = projects.find((item) => item.id === drag.id);
      if (project) await planProject(project, cell.employeeId, cell.date, cell.minutes);
      return;
    }

    const source = drag.ids.map((id) => byId.get(id)).filter((shift): shift is ScheduleShift => Boolean(shift));
    const lead = source[0];
    if (!lead) return;
    const copy = event.altKey || event.ctrlKey || event.metaKey;
    let minutes: number | undefined;
    if (cell.minutes !== undefined) {
      const wanted = Math.round((cell.minutes - drag.grabOffset) / SNAP) * SNAP;
      minutes = wanted - minutesOf(lead.startTime);
    }
    await shiftAll(source, {
      days: daysBetween(lead.date, cell.date),
      employeeId: cell.employeeId,
      minutes,
      copy,
    });
  }

  function onCellClick(cell: { employeeId?: string; date: string }) {
    if (!canEdit) return;
    setTarget(cell);
    setSelected(new Set());
  }

  function onCellDoubleClick(cell: { employeeId?: string; date: string }) {
    if (!canEdit) return;
    setSheet({ employeeId: cell.employeeId, date: cell.date, projectId: projectFilter || undefined });
  }

  function startResize(event: React.PointerEvent, shift: ScheduleShift) {
    if (!canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    const originY = event.clientY;
    const originEnd = endMinutesOf(shift);
    const begin = minutesOf(shift.startTime);
    let latest = originEnd;
    const move = (moveEvent: PointerEvent) => {
      const delta = ((moveEvent.clientY - originY) / HOUR_HEIGHT) * 60;
      latest = Math.max(begin + SNAP, Math.round((originEnd + delta) / SNAP) * SNAP);
      setResizing({ id: shift.id, end: latest });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResizing(null);
      if (latest !== originEnd) {
        void apply(
          { update: [{ id: shift.id, shift: { ...valuesOf(shift), endTime: timeOf(latest) } }] },
          "Fin du quart changée.",
        );
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function changePeriod(next: Period) {
    setPeriod(next);
    setSelected(new Set());
  }

  function go(step: number) {
    setAnchor(moveAnchor(period, anchor, step));
    setSelected(new Set());
  }

  // ---- Pieces ----

  function shiftChip(shift: ScheduleShift, { compact = false, showName = false }: { compact?: boolean; showName?: boolean } = {}) {
    const problem = conflicts.get(shift.id);
    const isSelected = selected.has(shift.id);
    const project = shift.projectNumber !== null ? formatProjectNumber(shift.projectNumber) : null;
    return (
      <div
        key={shift.id}
        draggable={canEdit}
        onDragStart={(event) => onShiftDragStart(event, shift)}
        onClick={(event) => onShiftClick(event, shift)}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (canEdit) setSheet({ shift, date: shift.date });
        }}
        title={[
          `${shift.employeeName} · ${shift.startTime.slice(0, 5)}–${shift.endTime.slice(0, 5)} (${hoursFormat(shift.hours)})`,
          project ? `${project}${shift.projectDescription ? ` — ${shift.projectDescription}` : ""}` : "Sans projet",
          shift.note,
          problem,
        ]
          .filter(Boolean)
          .join("\n")}
        className={cn(
          "relative select-none rounded-md border px-1.5 py-1 text-xs leading-tight text-foreground",
          toneOf(shift.projectId),
          canEdit && "cursor-grab active:cursor-grabbing",
          isSelected && "ring-2 ring-primary",
        )}
      >
        {problem && (
          <span className="absolute -top-1 -right-1 size-2 rounded-full bg-destructive ring-2 ring-background" aria-label={problem} />
        )}
        {showName && <div className="truncate font-medium">{shift.employeeName}</div>}
        <div className="flex items-center justify-between gap-1 tabular-nums">
          <span className={cn(!showName && "font-medium")}>
            {compact
              ? `${shift.startTime.slice(0, 5)}`
              : `${shift.startTime.slice(0, 5)}–${shift.endTime.slice(0, 5)}`}
          </span>
          {!compact && <span className="text-muted-foreground">{hoursFormat(shift.hours)}</span>}
        </div>
        {project && <div className="truncate text-muted-foreground">{project}{!compact && shift.projectDescription ? ` · ${shift.projectDescription}` : ""}</div>}
      </div>
    );
  }

  function leaveChip(leave: PlanningLeave) {
    const pending = leave.status === "EnAttente";
    return (
      <button
        key={leave.id}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setLeaveOpen(leave);
        }}
        className={cn(
          "block w-full truncate rounded-md border px-1.5 py-0.5 text-left text-xs",
          pending
            ? "border-dashed border-amber-500/60 bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgb(245_158_11/0.12)_4px,rgb(245_158_11/0.12)_8px)] text-amber-800 dark:text-amber-300"
            : "border-border bg-muted text-muted-foreground",
        )}
        title={`${leaveKindLabels[leave.kind]}${pending ? " · en attente" : " · approuvé"}${leave.hours != null ? ` · ${hoursFormat(leave.hours)}` : ""}`}
      >
        {leaveKindLabels[leave.kind]}
        {pending && " (demande)"}
      </button>
    );
  }

  function dayHeader(date: string, short: boolean) {
    const day = parse(date);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const hours = shifts.filter((shift) => shift.date === date).reduce((sum, shift) => sum + shift.hours, 0);
    return (
      <div
        key={date}
        className={cn(
          "border-l border-border px-2 py-1.5 text-xs",
          weekend && "bg-muted/40",
          date === today && "bg-primary/5",
        )}
      >
        <div className={cn("font-medium capitalize", date === today ? "text-primary" : "text-foreground")}>
          {day.toLocaleDateString("fr-CA", short ? { weekday: "narrow", day: "numeric" } : { weekday: "short", day: "numeric", month: "short" })}
        </div>
        {!short && <div className="tabular-nums text-muted-foreground">{hours > 0 ? hoursFormat(hours) : "—"}</div>}
      </div>
    );
  }

  // ---- Views ----

  function EmployeeGrid() {
    const compact = period === "mois";
    const columns = `minmax(9rem, 11rem) repeat(${days.length}, minmax(${compact ? "4.5rem" : "7.5rem"}, 1fr))`;
    return (
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <div className="grid min-w-max" style={{ gridTemplateColumns: columns }}>
          <div className="sticky left-0 z-10 bg-card px-2 py-1.5 text-xs font-medium text-muted-foreground">Employé</div>
          {days.map((date) => dayHeader(date, compact))}

          {employees.length === 0 && (
            <div className="col-span-full border-t border-border px-3 py-6 text-center text-sm text-muted-foreground">
              Aucun employé actif ne correspond à ces filtres.
            </div>
          )}

          {employees.map((employee) => {
            const own = shifts.filter((shift) => shift.employeeId === employee.id);
            const total = own.reduce((sum, shift) => sum + shift.hours, 0);
            return (
              <div key={employee.id} className="contents">
                <div className="sticky left-0 z-10 border-t border-border bg-card px-2 py-1.5">
                  <div className="truncate text-sm font-medium text-foreground">{employee.name}</div>
                  <div className="text-xs tabular-nums text-muted-foreground">{total > 0 ? hoursFormat(total) : "—"}</div>
                </div>
                {days.map((date) => {
                  const cell = { employeeId: employee.id, date };
                  const isTarget = target?.employeeId === employee.id && target.date === date;
                  const weekend = [0, 6].includes(parse(date).getDay());
                  return (
                    <div
                      key={date}
                      onClick={() => onCellClick(cell)}
                      onDoubleClick={() => onCellDoubleClick(cell)}
                      onDragOver={onCellDragOver}
                      onDrop={(event) => void onCellDrop(event, cell)}
                      className={cn(
                        "min-h-16 space-y-1 border-t border-l border-border p-1",
                        weekend && "bg-muted/30",
                        isTarget && "outline-2 -outline-offset-2 outline-primary/60",
                      )}
                    >
                      {leavesOn(employee.id, date).map((leave) => leaveChip(leave))}
                      {own
                        .filter((shift) => shift.date === date)
                        .map((shift) => (
                          shiftChip(shift, { compact })
                        ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function AgendaDays() {
    const visible = shifts.filter((shift) => employees.some((employee) => employee.id === shift.employeeId));
    const first = Math.min(6 * 60, ...visible.map((shift) => minutesOf(shift.startTime)));
    const last = Math.max(19 * 60, ...visible.map((shift) => Math.min(endMinutesOf(shift), 24 * 60)));
    const from = Math.floor(first / 60) * 60;
    const to = Math.min(24 * 60, Math.ceil(last / 60) * 60);
    const hours = Array.from({ length: (to - from) / 60 }, (_, i) => from / 60 + i);
    const height = ((to - from) / 60) * HOUR_HEIGHT;
    const columns = `3.5rem repeat(${days.length}, minmax(${days.length === 1 ? "12rem" : "8rem"}, 1fr))`;

    return (
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <div className="grid min-w-max" style={{ gridTemplateColumns: columns }}>
          <div />
          {days.map((date) => dayHeader(date, false))}

          {/* All-day row: the leaves. */}
          <div className="border-t border-border px-1 py-1 text-[10px] text-muted-foreground">Congés</div>
          {days.map((date) => (
            <div key={date} className="space-y-1 border-t border-l border-border p-1">
              {leaves
                .filter((leave) => leave.startDate <= date && leave.endDate >= date)
                .filter((leave) => employees.some((employee) => employee.id === leave.employeeId))
                .map((leave) => (
                  <div key={leave.id} className="flex items-center gap-1">
                    <span className="truncate text-[10px] text-muted-foreground">
                      {employees.find((employee) => employee.id === leave.employeeId)?.name.split(" ")[0]}
                    </span>
                    <div className="min-w-0 flex-1">
                      {leaveChip(leave)}
                    </div>
                  </div>
                ))}
            </div>
          ))}

          <div className="relative border-t border-border" style={{ height }}>
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                style={{ top: (hour * 60 - from) * (HOUR_HEIGHT / 60) }}
              >
                {hour > from / 60 ? `${String(hour).padStart(2, "0")}:00` : ""}
              </div>
            ))}
          </div>
          {days.map((date) => {
            const dayShifts = visible
              .filter((shift) => shift.date === date)
              .sort((a, b) => minutesOf(a.startTime) - minutesOf(b.startTime));
            // Side by side when they overlap: each takes the first lane free at its start.
            const lanes: number[] = [];
            const placed = dayShifts.map((shift) => {
              const begin = minutesOf(shift.startTime);
              let lane = lanes.findIndex((laneEnd) => laneEnd <= begin);
              if (lane === -1) {
                lane = lanes.length;
                lanes.push(0);
              }
              lanes[lane] = endMinutesOf(shift);
              return { shift, lane };
            });
            const laneCount = Math.max(1, lanes.length);
            const single = employees.length === 1 ? employees[0].id : undefined;

            return (
              <div
                key={date}
                className={cn("relative border-t border-l border-border", date === today && "bg-primary/5")}
                style={{ height }}
                onClick={() => onCellClick({ employeeId: single, date })}
                onDoubleClick={() => onCellDoubleClick({ employeeId: single, date })}
                onDragOver={onCellDragOver}
                onDrop={(event) => {
                  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                  const minutes = from + ((event.clientY - rect.top) / HOUR_HEIGHT) * 60;
                  void onCellDrop(event, { date, minutes, employeeId: undefined });
                }}
              >
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="absolute inset-x-0 border-t border-border/60"
                    style={{ top: (hour * 60 - from) * (HOUR_HEIGHT / 60) }}
                  />
                ))}
                {placed.map(({ shift, lane }) => {
                  const begin = minutesOf(shift.startTime);
                  const finish = Math.min(resizing?.id === shift.id ? resizing.end : endMinutesOf(shift), to);
                  return (
                    <div
                      key={shift.id}
                      className="absolute px-0.5"
                      style={{
                        top: (begin - from) * (HOUR_HEIGHT / 60),
                        height: Math.max(20, (finish - begin) * (HOUR_HEIGHT / 60)),
                        left: `${(lane / laneCount) * 100}%`,
                        width: `${100 / laneCount}%`,
                      }}
                    >
                      <div className="relative h-full overflow-hidden [&>div]:h-full">
                        {shiftChip(shift, { showName: employees.length !== 1 })}
                        {canEdit && (
                          <div
                            onPointerDown={(event) => startResize(event, shift)}
                            className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                            aria-label="Changer la fin du quart"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function AgendaMonth() {
    const firstMonday = mondayOf(start);
    const lastSunday = addDays(mondayOf(end), 6);
    const cells = datesFrom(firstMonday, lastSunday);
    const single = employees.length === 1 ? employees[0].id : undefined;
    const visible = shifts.filter((shift) => employees.some((employee) => employee.id === shift.employeeId));
    return (
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <div className="grid min-w-[42rem] grid-cols-7">
          {["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."].map((label) => (
            <div key={label} className="border-l border-border px-2 py-1.5 text-xs font-medium text-muted-foreground first:border-l-0">
              {label}
            </div>
          ))}
          {cells.map((date) => {
            const outside = date < start || date > end;
            const isTarget = target?.date === date && !target.employeeId;
            const dayShifts = visible.filter((shift) => shift.date === date);
            return (
              <div
                key={date}
                onClick={() => onCellClick({ employeeId: single, date })}
                onDoubleClick={() => onCellDoubleClick({ employeeId: single, date })}
                onDragOver={onCellDragOver}
                onDrop={(event) => void onCellDrop(event, { date, employeeId: undefined })}
                className={cn(
                  "min-h-24 space-y-1 border-t border-l border-border p-1 [&:nth-child(7n+1)]:border-l-0",
                  outside && "bg-muted/40 text-muted-foreground",
                  isTarget && "outline-2 -outline-offset-2 outline-primary/60",
                )}
              >
                <div className={cn("text-xs tabular-nums", date === today ? "font-semibold text-primary" : "text-muted-foreground")}>
                  {parse(date).getDate()}
                </div>
                {!outside && (
                  <>
                    {leaves
                      .filter((leave) => leave.startDate <= date && leave.endDate >= date)
                      .map((leave) => (
                        leaveChip(leave)
                      ))}
                    {dayShifts.slice(0, 4).map((shift) => (
                      shiftChip(shift, { compact: true, showName: employees.length !== 1 })
                    ))}
                    {dayShifts.length > 4 && (
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={(event) => {
                          event.stopPropagation();
                          setAnchor(date);
                          changePeriod("jour");
                        }}
                      >
                        + {dayShifts.length - 4} autres
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function ProjectsPanel() {
    const unassigned = projects.filter((project) => !project.assigned);
    const assigned = projects.filter((project) => project.assigned);
    const item = (project: PlanningProject) => (
      <li
        key={project.id}
        draggable={canEdit}
        onDragStart={(event) => onProjectDragStart(event, project)}
        className={cn(
          "rounded-md border border-border bg-card p-2 text-sm",
          canEdit && "cursor-grab active:cursor-grabbing",
          projectFilter === project.id && "ring-2 ring-primary",
        )}
      >
        <button
          type="button"
          className="block w-full text-left"
          onClick={() => setProjectFilter((current) => (current === project.id ? "" : project.id))}
          title={projectFilter === project.id ? "Voir tous les projets" : "Ne voir que ce projet"}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-foreground">{formatProjectNumber(project.number)}</span>
            {project.assigned && <span className="text-xs tabular-nums text-muted-foreground">{hoursFormat(project.plannedHours)}</span>}
          </div>
          {project.description && <div className="truncate text-foreground">{project.description}</div>}
          <div className="truncate text-xs text-muted-foreground">{project.clientName}</div>
          {(project.startDate || project.endDate) && (
            <div className="text-xs text-muted-foreground">
              {formatDateOnly(project.startDate)} → {formatDateOnly(project.endDate)}
            </div>
          )}
          {project.assigned && (
            <div className="mt-1 truncate text-xs text-muted-foreground">{project.employeeNames.join(", ")}</div>
          )}
        </button>
      </li>
    );
    return (
      <aside className="w-full shrink-0 lg:w-72">
        <div className="rounded-lg border border-border bg-card p-3">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
            <FolderKanban className="size-4" />
            Projets à planifier
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Les projets ouverts, selon qu&apos;ils ont un quart sur la période. Glissez-en un sur une case pour le planifier.
          </p>
          <Tabs defaultValue="sans">
            <TabsList className="mb-2 w-full">
              <TabsTrigger value="sans" className="gap-1.5">
                Sans assignation
                <Badge variant={unassigned.length > 0 ? "destructive" : "secondary"} className="tabular-nums">
                  {unassigned.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="avec" className="gap-1.5">
                Avec
                <Badge variant="secondary" className="tabular-nums">
                  {assigned.length}
                </Badge>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="sans">
              {unassigned.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Tous les projets ouverts ont un quart sur la période.</p>
              ) : (
                <ul className="max-h-[60vh] space-y-2 overflow-y-auto">{unassigned.map(item)}</ul>
              )}
            </TabsContent>
            <TabsContent value="avec">
              {assigned.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Aucun projet n&apos;a encore de quart sur la période.</p>
              ) : (
                <ul className="max-h-[60vh] space-y-2 overflow-y-auto">{assigned.map(item)}</ul>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </aside>
    );
  }

  const teams = data?.teams ?? [];
  const pendingLeaves = leaves.filter((leave) => leave.status === "EnAttente").length;

  return (
    <div>
      {/* Navigation and how the period is read. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold capitalize text-foreground">{periodTitle(period, start, end)}</h2>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {data ? `${hoursFormat(shifts.reduce((sum, shift) => sum + shift.hours, 0))} prévues` : "Chargement…"}
            {pendingLeaves > 0 && (
              <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-400">
                {pendingLeaves} congé{pendingLeaves > 1 ? "s" : ""} à décider
              </Badge>
            )}
            {(isFetching || batch.isPending) && <Spinner className="size-3.5" />}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Période précédente" onClick={() => go(-1)}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(todayIso())}>
            Aujourd&apos;hui
          </Button>
          <Button variant="outline" size="icon" aria-label="Période suivante" onClick={() => go(1)}>
            <ChevronRight />
          </Button>
          <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Période">
            {(Object.keys(periodLabels) as Period[]).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={period === value ? "secondary" : "ghost"}
                aria-pressed={period === value}
                onClick={() => changePeriod(value)}
              >
                {periodLabels[value]}
              </Button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Affichage">
            <Button
              size="sm"
              variant={view === "employes" ? "secondary" : "ghost"}
              aria-pressed={view === "employes"}
              onClick={() => setView("employes")}
            >
              <Rows3 />
              Par employé
            </Button>
            <Button
              size="sm"
              variant={view === "agenda" ? "secondary" : "ghost"}
              aria-pressed={view === "agenda"}
              onClick={() => setView("agenda")}
            >
              <CalendarDays />
              Agenda
            </Button>
          </div>
          {canEdit && (
            <Button onClick={() => setSheet({ date: target?.date ?? (today >= start && today <= end ? today : start), employeeId: target?.employeeId })}>
              <Plus />
              Ajouter un quart
            </Button>
          )}
        </div>
      </div>

      {/* Filters and the actions on many shifts at once. */}
      {canEdit && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Select value={teamId || "toutes"} onValueChange={(value) => setTeamId(!value || value === "toutes" ? "" : String(value))}>
            <SelectTrigger className="w-48" aria-label="Équipe">
              <SelectValue>
                {(value: string) => (value === "toutes" ? "Toutes les équipes" : (teams.find((team) => team.id === value)?.name ?? "Équipe"))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="toutes">Toutes les équipes</SelectItem>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <EmployeeMultiSelect value={employeeIds} onChange={setEmployeeIds} />
          <Select
            value={projectFilter || "tous"}
            onValueChange={(value) => setProjectFilter(!value || value === "tous" ? "" : String(value))}
          >
            <SelectTrigger className="w-56" aria-label="Projet">
              <SelectValue>
                {(value: string) => {
                  if (value === "tous") return "Tous les projets";
                  const project = projects.find((item) => item.id === value);
                  return project ? `${formatProjectNumber(project.number)} ${project.description ?? ""}` : "Projet";
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tous">Tous les projets</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {formatProjectNumber(project.number)} {project.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {period !== "mois" && (
              <Button variant="outline" size="sm" onClick={() => void copyPeriod()} disabled={batch.isPending}>
                <CopyPlus />
                {period === "jour" ? "Copier vers demain" : "Copier vers la semaine suivante"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void undo()}
              disabled={undoStack.length === 0 || batch.isPending}
              title={undoStack.at(-1) ? `Annuler : ${undoStack.at(-1)!.label}` : "Rien à annuler"}
            >
              <Undo2 />
              Annuler
            </Button>
            <Button
              variant={panelOpen ? "secondary" : "outline"}
              size="sm"
              aria-pressed={panelOpen}
              onClick={() => setPanelOpen((open) => !open)}
            >
              <FolderKanban />
              Projets
              <Badge variant="secondary" className="tabular-nums">
                {projects.filter((project) => !project.assigned).length}
              </Badge>
            </Button>
          </div>
        </div>
      )}

      {canEdit && (
        <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <Keyboard className="size-3.5" />
          <span>Glisser pour déplacer · Alt ou Ctrl + glisser pour copier</span>
          <span>Ctrl+C / Ctrl+V copier-coller</span>
          <span>Ctrl+D dupliquer au lendemain</span>
          <span>Suppr retirer · Ctrl+Z annuler</span>
          <span>Maj+clic pour en choisir plusieurs · double-clic pour créer ou modifier</span>
        </p>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : isError ? (
            <LoadErrorState
              error={error}
              title="Horaire indisponible"
              fallback="L'horaire de cette période n'a pas pu être chargé."
              onRetry={() => refetch()}
            />
          ) : view === "employes" ? (
            EmployeeGrid()
          ) : period === "mois" ? (
            AgendaMonth()
          ) : (
            AgendaDays()
          )}
        </div>
        {canEdit && panelOpen && data && ProjectsPanel()}
      </div>

      {sheet && (
        <ShiftSheet
          key={`${sheet.shift?.id ?? "nouveau"}-${sheet.date}-${sheet.employeeId ?? ""}-${sheet.projectId ?? ""}`}
          shift={sheet.shift}
          defaultEmployeeId={sheet.employeeId}
          defaultProjectId={sheet.projectId}
          defaultDate={sheet.date}
          open
          onOpenChange={(open) => !open && setSheet(null)}
        />
      )}

      <Dialog open={Boolean(leaveOpen)} onOpenChange={(open) => !open && setLeaveOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{leaveOpen ? leaveKindLabels[leaveOpen.kind] : ""}</DialogTitle>
            <DialogDescription>
              {leaveOpen &&
                `${employees.find((employee) => employee.id === leaveOpen.employeeId)?.name ?? ""} · du ${formatDateOnly(leaveOpen.startDate)} au ${formatDateOnly(leaveOpen.endDate)}${leaveOpen.hours != null ? ` · ${hoursFormat(leaveOpen.hours)}` : ""}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <Badge variant={leaveOpen?.status === "EnAttente" ? "outline" : "secondary"}>
              {leaveOpen?.status === "EnAttente" ? "En attente" : "Approuvé"}
            </Badge>
            {leaveOpen?.note && <p className="whitespace-pre-line text-muted-foreground">{leaveOpen.note}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveOpen(null)}>
              Fermer
            </Button>
            {canEdit && leaveOpen?.status === "EnAttente" && (
              <>
                <Button
                  variant="destructive"
                  disabled={decide.isPending}
                  onClick={async () => {
                    try {
                      await decide.mutateAsync({ id: leaveOpen.id, approve: false, decisionNote: null });
                      toast.success("Demande refusée.");
                      setLeaveOpen(null);
                    } catch (failure) {
                      toast.error(failure instanceof ApiError ? failure.message : "Impossible de refuser la demande.");
                    }
                  }}
                >
                  Refuser
                </Button>
                <Button
                  disabled={decide.isPending}
                  onClick={async () => {
                    try {
                      await decide.mutateAsync({ id: leaveOpen.id, approve: true, decisionNote: null });
                      toast.success("Demande approuvée.");
                      setLeaveOpen(null);
                    } catch (failure) {
                      toast.error(failure instanceof ApiError ? failure.message : "Impossible d'approuver la demande.");
                    }
                  }}
                >
                  {decide.isPending && <Spinner />}
                  Approuver
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
