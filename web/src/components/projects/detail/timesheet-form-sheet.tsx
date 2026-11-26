"use client";

import { useEffect, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { EmployeePicker } from "@/components/team/employee-picker";
import { useSaveTimesheet } from "@/hooks/use-timesheets";
import { useTeamQuery } from "@/hooks/use-team";
import { ApiError } from "@/lib/api";
import { formatDateOnly } from "@/lib/dates";
import type { TimesheetEntry } from "@/lib/types";
import { ex } from "@/lib/placeholders";

export const ROUNDING_MINUTES = 15;

/**
 * The browser's copy of WorkHours.Between (src/Vexta.Api/Common/WorkHours.cs): the minutes
 * between the two moments, rounded to the nearest quarter, and zero when the end is not after
 * the start. Kept here rather than asked of the server so the total moves as the times are
 * typed; the figure that is stored is still the server's, worked out the same way.
 *
 * Null, not zero, while something is still missing: an empty form has no total yet, which is a
 * different thing from a shift that lasts no time.
 */
export function quarterHoursBetween(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
): number | null {
  if (!startDate || !startTime || !endDate || !endTime) return null;

  const start = new Date(`${startDate}T${startTime}`);
  const end = new Date(`${endDate}T${endTime}`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const minutes = (end.getTime() - start.getTime()) / 60_000;
  if (minutes <= 0) return 0;

  // Math.round sends a half up, which is the away-from-zero the server uses for these always
  // positive minutes: 7 min 30 s becomes a quarter rather than nothing.
  return (Math.round(minutes / ROUNDING_MINUTES) * ROUNDING_MINUTES) / 60;
}

/** 8.25 as the sheet writes it: « 8,25 h ». A whole number keeps no decimals. */
export function formatHours(hours: number): string {
  return `${new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 }).format(hours)} h`;
}

/** "07:52" said the way the trade says it: 7 h 52. */
function clock(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  return match ? `${Number(match[1])} h ${match[2]}` : value;
}

/** Today, from the local calendar: toISOString would hand back yesterday after 19 h here. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

import { TaskPickerField } from "@/components/projects/detail/task-picker-field";

const formSchema = z
  .object({
    employeeId: z.string().min(1, "Choisissez un employé."),
    startDate: z.string().min(1, "La date de début est requise."),
    endDate: z.string().min(1, "La date de fin est requise."),
    startTime: z.string().min(1, "L'heure de début est requise."),
    endTime: z.string().min(1, "L'heure de fin est requise."),
    note: z.string().trim().max(500, "500 caractères maximum."),
    projectTaskId: z.string(),
  })
  .refine(
    (values) =>
      quarterHoursBetween(values.startDate, values.startTime, values.endDate, values.endTime) !== 0,
    { message: "La fin du quart doit venir après son début.", path: ["endTime"] },
  );

type FormValues = z.infer<typeof formSchema>;

export function TimesheetFormSheet({
  open,
  onOpenChange,
  projectId,
  entry,
  defaultTaskId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  entry?: TimesheetEntry;
  /** Opened from a task's page: a new row is filed against that task until somebody says otherwise. */
  defaultTaskId?: string;
}) {
  const isEditing = Boolean(entry);
  const save = useSaveTimesheet(projectId);
  const { data: team, isLoading: teamLoading } = useTeamQuery();
  const employees = team?.employees ?? [];

  // The end date trails the start date until somebody sets it themselves. A ref rather than
  // state, and read from the change handler rather than an effect: mirroring one field into
  // another during a render is what the React Compiler lint refuses, and the handler is where
  // the intent actually lives.
  const endDateEdited = useRef(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      employeeId: "",
      startDate: today(),
      endDate: today(),
      startTime: "",
      endTime: "",
      note: "",
      projectTaskId: "",
    },
  });

  useEffect(() => {
    if (!open) return;

    const start = entry?.startDate ?? today();

    form.reset({
      employeeId: entry?.employeeId ?? "",
      startDate: start,
      endDate: entry?.endDate ?? start,
      startTime: entry?.startTime ?? "",
      endTime: entry?.endTime ?? "",
      note: entry?.note ?? "",
      projectTaskId: entry ? (entry.projectTaskId ?? "") : (defaultTaskId ?? ""),
    });

    // An entry whose two dates already differ was set by hand once, so moving the start date
    // must not quietly pull the end date back onto it.
    endDateEdited.current = entry !== undefined && entry.startDate !== entry.endDate;
  }, [open, entry, form, defaultTaskId]);

  const [startDate, startTime, endDate, endTime] = useWatch({
    control: form.control,
    name: ["startDate", "startTime", "endDate", "endTime"],
  });

  const total = quarterHoursBetween(startDate, startTime, endDate, endTime);
  const sameDay = startDate === endDate;
  const from = sameDay ? clock(startTime) : `${formatDateOnly(startDate)} ${clock(startTime)}`;
  const to = sameDay ? clock(endTime) : `${formatDateOnly(endDate)} ${clock(endTime)}`;

  async function onSubmit(values: FormValues) {
    try {
      await save.mutateAsync({
        id: entry?.id,
        values: {
          employeeId: values.employeeId,
          startDate: values.startDate,
          endDate: values.endDate,
          startTime: values.startTime,
          endTime: values.endTime,
          note: values.note || null,
          projectTaskId: values.projectTaskId || null,
        },
      });

      toast.success(isEditing ? "Poinçon mis à jour." : "Heures ajoutées.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer ces heures.");
    }
  }

  const pending = save.isPending;

  return (
    <Sheet
      open={open}
      // Cleared as the panel closes rather than as it opens: the same reset, but in an event
      // handler, where it cannot cascade a render.
      onOpenChange={(next) => {
        if (!next) endDateEdited.current = false;
        onOpenChange(next);
      }}
    >
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier les heures" : "Ajouter des heures"}</SheetTitle>
          <SheetDescription>
            Un quart de travail sur ce chantier, du début à la fin.
          </SheetDescription>
        </SheetHeader>

        <form
          id="timesheet-form"
          className="flex-1 overflow-y-auto px-4"
          // Stops here rather than bubbling: this panel is opened from a page that may itself
          // sit inside a form, and React routes a submit up its own tree regardless of where
          // the portal puts the markup.
          onSubmit={(event) => {
            event.stopPropagation();
            return form.handleSubmit(onSubmit)(event);
          }}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="employeeId"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="timesheet-employee">
                    Employé
                    <RequiredMark />
                  </FieldLabel>
                  {/* A searchable field rather than a dropdown: a crew of six fits in a list
                      and a crew of sixty does not, and the person filing the hours knows the
                      name they are looking for. */}
                  <EmployeePicker
                    id="timesheet-employee"
                    value={field.value}
                    onChange={field.onChange}
                    invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    employees.length === 0 &&
                    !teamLoading && (
                      <FieldDescription>
                        Personne sur la paie pour l&apos;instant : ajoutez l&apos;employé dans Équipe.
                      </FieldDescription>
                    )
                  )}
                </Field>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="startDate"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="timesheet-start-date">
                      Date de début
                      <RequiredMark />
                    </FieldLabel>
                    <Input
                      {...field}
                      id="timesheet-start-date"
                      type="date"
                      aria-invalid={fieldState.invalid}
                      onChange={(event) => {
                        field.onChange(event);
                        if (!endDateEdited.current) form.setValue("endDate", event.target.value);
                      }}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="endDate"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="timesheet-end-date">
                      Date de fin
                      <RequiredMark />
                    </FieldLabel>
                    <Input
                      {...field}
                      id="timesheet-end-date"
                      type="date"
                      aria-invalid={fieldState.invalid}
                      onChange={(event) => {
                        endDateEdited.current = true;
                        field.onChange(event);
                      }}
                    />
                    {fieldState.invalid ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : (
                      <FieldDescription>
                        La même journée, sauf pour un quart qui passe minuit.
                      </FieldDescription>
                    )}
                  </Field>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="startTime"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="timesheet-start-time">
                      Heure de début
                      <RequiredMark />
                    </FieldLabel>
                    <Input
                      {...field}
                      id="timesheet-start-time"
                      type="time"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="endTime"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="timesheet-end-time">
                      Heure de fin
                      <RequiredMark />
                    </FieldLabel>
                    <Input
                      {...field}
                      id="timesheet-end-time"
                      type="time"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            {/* Shown as arithmetic rather than as a number that appeared: the quarter hour is
                the unit the trade is paid in, and seeing 7 h 52 become 8,25 h is how somebody
                trusts the figure instead of re-checking it. */}
            <Field>
              <FieldLabel htmlFor="timesheet-total">Total</FieldLabel>
              <output
                id="timesheet-total"
                className="rounded-md border border-border bg-muted/40 px-3 py-2 text-lg font-semibold tabular-nums text-foreground"
              >
                {total ? formatHours(total) : "—"}
              </output>
              <FieldDescription>
                {total == null
                  ? "Le total apparaît dès que les deux heures sont saisies."
                  : total === 0
                    ? "La fin du quart doit venir après son début."
                    : `${from} → ${to} = ${formatHours(total)}, arrondi au quart d'heure.`}
              </FieldDescription>
            </Field>

            <Controller
              name="note"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="timesheet-note">Note</FieldLabel>
                  <Textarea
                    {...field}
                    id="timesheet-note"
                    rows={3}
                    placeholder={ex("Coffrage du mur est")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="projectTaskId"
              control={form.control}
              render={({ field }) => (
                <TaskPickerField
                  id="timesheet-task"
                  projectId={projectId}
                  value={field.value || null}
                  onChange={(taskId) => field.onChange(taskId ?? "")}
                />
              )}
            />
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="timesheet-form" disabled={pending}>
            {pending && <Spinner />}
            {isEditing ? "Enregistrer" : "Ajouter les heures"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
