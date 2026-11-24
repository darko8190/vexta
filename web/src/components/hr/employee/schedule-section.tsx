"use client";

import { useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { ProjectPicker } from "@/components/invoices/project-picker";
import { EmployeePicker } from "@/components/team/employee-picker";
import { useDeleteShift, useSaveShift, useScheduleQuery } from "@/hooks/use-employee-file";
import { ApiError } from "@/lib/api";
import { formatDateOnly, todayIso } from "@/lib/dates";
import { ex } from "@/lib/placeholders";
import { formatProjectNumber } from "@/lib/types";
import type { ScheduleShift } from "@/lib/types";
import { rowOpenClassName, rowOpenProps } from "@/components/layout/row-open";
import { cn } from "@/lib/utils";

/** The Monday of the week a day falls in — the week a Québec payroll runs on. */
function mondayOf(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function shiftWeek(iso: string, weeks: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + weeks * 7);

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** "lundi 23 novembre" — the day of the week first, because that is how a schedule is read. */
function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-CA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function ShiftSheet({
  employeeId,
  shift,
  defaultDate,
  open,
  onOpenChange,
}: {
  employeeId?: string;
  shift?: ScheduleShift;
  defaultDate: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveShift();
  const isEditing = Boolean(shift);

  const [owner, setOwner] = useState(shift?.employeeId ?? employeeId ?? "");
  const [projectId, setProjectId] = useState(shift?.projectId ?? "");
  const [date, setDate] = useState(shift?.date ?? defaultDate);
  const [startTime, setStartTime] = useState(shift?.startTime?.slice(0, 5) ?? "07:00");
  const [endTime, setEndTime] = useState(shift?.endTime?.slice(0, 5) ?? "16:00");
  const [note, setNote] = useState(shift?.note ?? "");

  async function onSubmit() {
    if (!owner) {
      toast.error("Choisissez qui travaille ce quart.");
      return;
    }

    try {
      await save.mutateAsync({
        id: shift?.id ?? null,
        values: {
          employeeId: owner,
          projectId: projectId || null,
          date,
          startTime: `${startTime}:00`,
          endTime: `${endTime}:00`,
          note: note.trim() || null,
        },
      });
      toast.success(isEditing ? "Quart modifié." : "Quart ajouté.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer ce quart.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier le quart" : "Nouveau quart"}</SheetTitle>
          <SheetDescription>
            Ce qui est prévu. Les heures réellement travaillées se saisissent dans les feuilles de
            temps du projet.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <FieldGroup>
            {!employeeId && (
              <Field>
                <FieldLabel htmlFor="shift-employee">Employé</FieldLabel>
                <EmployeePicker id="shift-employee" value={owner} onChange={setOwner} />
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="shift-date">Date</FieldLabel>
              <Input id="shift-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="shift-start">Début</FieldLabel>
                <Input
                  id="shift-start"
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="shift-end">Fin</FieldLabel>
                <Input
                  id="shift-end"
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                />
                <FieldDescription>
                  Une fin avant le début veut dire que le quart passe minuit.
                </FieldDescription>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="shift-project">Projet</FieldLabel>
              <ProjectPicker id="shift-project" value={projectId} onChange={setProjectId} />
              <FieldDescription>Facultatif : un quart à l&apos;atelier n&apos;est sur aucun chantier.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="shift-note">Note</FieldLabel>
              <Input
                id="shift-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={ex("Apporter la scie à onglets")}
              />
            </Field>
          </FieldGroup>
        </div>

        <SheetFooter>
          <Button type="button" onClick={onSubmit} disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {isEditing ? "Enregistrer" : "Ajouter le quart"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The week that is planned, grouped by day.
 *
 * Planned, not worked — the timesheets are what happened. Keeping the two apart is what lets
 * somebody compare them; folding them together would turn a plan nobody corrected into a
 * payroll record.
 */
export function ScheduleSection({ employeeId, canEdit }: { employeeId?: string; canEdit: boolean }) {
  const [week, setWeek] = useState(() => mondayOf(todayIso()));
  const { data, isLoading, isError, error, refetch } = useScheduleQuery(week, employeeId);
  const remove = useDeleteShift();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleShift | undefined>(undefined);

  const sheetKey = `${editing?.id ?? "nouveau"}-${sheetOpen}`;

  async function onDelete(id: string) {
    try {
      await remove.mutateAsync(id);
      toast.success("Quart retiré.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de retirer ce quart.");
    }
  }

  const shifts = data?.shifts ?? [];

  // Grouped here rather than by the API: the API answers with a week's rows, and which day each
  // belongs to is a presentation question that changes with the screen.
  const days = shifts.reduce<Record<string, ScheduleShift[]>>((grouped, shift) => {
    (grouped[shift.date] ??= []).push(shift);
    return grouped;
  }, {});

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Horaire</h2>
          <p className="text-sm text-muted-foreground">
            {data
              ? `Semaine du ${formatDateOnly(data.start)} au ${formatDateOnly(data.end)} · ${data.totalHours.toLocaleString("fr-CA", { maximumFractionDigits: 2 })} h prévues`
              : "Ce qui est prévu, semaine par semaine."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Semaine précédente" onClick={() => setWeek(shiftWeek(week, -1))}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeek(mondayOf(todayIso()))}>
            Cette semaine
          </Button>
          <Button variant="outline" size="icon" aria-label="Semaine suivante" onClick={() => setWeek(shiftWeek(week, 1))}>
            <ChevronRight />
          </Button>
          {canEdit && (
            <Button
              onClick={() => {
                setEditing(undefined);
                setSheetOpen(true);
              }}
            >
              <Plus />
              Ajouter un quart
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Horaire indisponible"
          fallback="L'horaire de cette semaine n'a pas pu être chargé."
          onRetry={() => refetch()}
        />
      ) : shifts.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="Rien de prévu cette semaine"
          description="Ajoutez un quart, ou passez à une autre semaine avec les flèches."
          action={
            canEdit ? (
              <Button
                onClick={() => {
                  setEditing(undefined);
                  setSheetOpen(true);
                }}
              >
                <Plus />
                Ajouter un quart
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {Object.entries(days).map(([date, dayShifts]) => (
            <div key={date}>
              <h3 className="mb-2 text-sm font-medium capitalize text-muted-foreground">{dayLabel(date)}</h3>
              <ul className="space-y-2">
                {dayShifts.map((shift) => (
                  <li
                    key={shift.id}
                    {...(canEdit ? rowOpenProps(() => { setEditing(shift); setSheetOpen(true); }, "Ouvrir la fiche") : {})}
                    className={cn("flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3", canEdit && rowOpenClassName)}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium tabular-nums text-foreground">
                          {shift.startTime.slice(0, 5)} – {shift.endTime.slice(0, 5)}
                        </span>
                        <Badge variant="secondary" className="tabular-nums">
                          {shift.hours.toLocaleString("fr-CA", { maximumFractionDigits: 2 })} h
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {[
                          employeeId ? null : shift.employeeName,
                          shift.projectNumber !== null
                            ? `${formatProjectNumber(shift.projectNumber)}${shift.projectDescription ? ` — ${shift.projectDescription}` : ""}`
                            : null,
                          shift.note,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>

                    {canEdit && (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(shift);
                            setSheetOpen(true);
                          }}
                        >
                          Modifier
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Retirer ce quart"
                          onClick={() => onDelete(shift.id)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <ShiftSheet
        key={sheetKey}
        employeeId={employeeId}
        shift={editing}
        defaultDate={week}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
