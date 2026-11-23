"use client";

import { useState } from "react";
import { Check, Palmtree, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { EmployeePicker } from "@/components/team/employee-picker";
import {
  useCancelLeave,
  useCreateLeave,
  useDecideLeave,
  useLeavesQuery,
} from "@/hooks/use-employee-file";
import { ApiError } from "@/lib/api";
import { formatDateOnly, todayIso } from "@/lib/dates";
import { leaveKindLabels, leaveStatusBadgeVariant, leaveStatusLabels } from "@/lib/labels";
import { ex } from "@/lib/placeholders";
import type { LeaveKind } from "@/lib/types";

const kinds = Object.keys(leaveKindLabels) as LeaveKind[];

function LeaveSheet({
  employeeId,
  open,
  onOpenChange,
}: {
  employeeId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateLeave();

  const [owner, setOwner] = useState(employeeId ?? "");
  const [kind, setKind] = useState<LeaveKind>("Vacances");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [hoursText, setHoursText] = useState("");
  const [note, setNote] = useState("");

  async function onSubmit() {
    if (!employeeId && !owner) {
      toast.error("Choisissez qui prend ce congé.");
      return;
    }
    if (endDate < startDate) {
      toast.error("La fin du congé ne peut pas précéder son début.");
      return;
    }

    const parsed = hoursText.trim() ? Number(hoursText.replace(",", ".")) : null;
    if (parsed !== null && (!Number.isFinite(parsed) || parsed <= 0)) {
      toast.error("Le nombre d'heures doit être supérieur à zéro.");
      return;
    }

    try {
      await create.mutateAsync({
        employeeId: employeeId ?? owner,
        kind,
        startDate,
        endDate,
        hours: parsed,
        note: note.trim() || null,
      });
      toast.success("Demande déposée.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de déposer cette demande.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Nouvelle demande de congé</SheetTitle>
          <SheetDescription>
            Elle part en attente. Quelqu&apos;un de l&apos;entreprise l&apos;approuve ou la refuse.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <FieldGroup>
            {!employeeId && (
              <Field>
                <FieldLabel htmlFor="leave-employee">Employé</FieldLabel>
                <EmployeePicker id="leave-employee" value={owner} onChange={setOwner} />
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="leave-kind">Motif</FieldLabel>
              <Select value={kind} onValueChange={(value) => setKind((value ?? "Vacances") as LeaveKind)}>
                <SelectTrigger id="leave-kind" className="w-full">
                  <SelectValue>{(value: LeaveKind) => leaveKindLabels[value]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {kinds.map((value) => (
                    <SelectItem key={value} value={value}>
                      {leaveKindLabels[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {kind === "BanqueHeures" && (
                <FieldDescription>
                  Une fois approuvé, les heures sortent automatiquement de la banque.
                </FieldDescription>
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="leave-start">Du</FieldLabel>
                <Input
                  id="leave-start"
                  type="date"
                  value={startDate}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    // A one-day leave is the common case, so the end follows the start until
                    // somebody moves it themselves.
                    if (endDate < event.target.value) setEndDate(event.target.value);
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="leave-end">Au</FieldLabel>
                <Input
                  id="leave-end"
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="leave-hours">Heures</FieldLabel>
              <Input
                id="leave-hours"
                inputMode="decimal"
                value={hoursText}
                onChange={(event) => setHoursText(event.target.value)}
                placeholder={ex("4")}
              />
              <FieldDescription>
                Pour une demi-journée ou un après-midi. Laissez vide pour des journées complètes.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="leave-note">Note</FieldLabel>
              <Textarea
                id="leave-note"
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={ex("Mariage de ma sœur.")}
              />
            </Field>
          </FieldGroup>
        </div>

        <SheetFooter>
          <Button type="button" onClick={onSubmit} disabled={create.isPending}>
            {create.isPending && <Spinner />}
            Déposer la demande
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Time off, asked for and answered.
 *
 * Waiting requests sort first, because the list is worked from the top and an answered one is
 * history the moment it is answered. The decision note is shown beside the answer: a refusal
 * without a reason is the kind of thing that gets asked about again in March.
 */
export function LeavesSection({ employeeId, canDecide }: { employeeId?: string; canDecide: boolean }) {
  const { data, isLoading, isError, error, refetch } = useLeavesQuery({ employeeId });
  const decide = useDecideLeave();
  const cancel = useCancelLeave();

  const [open, setOpen] = useState(false);

  async function answer(id: string, approve: boolean) {
    try {
      await decide.mutateAsync({ id, approve, decisionNote: null });
      toast.success(approve ? "Congé approuvé." : "Congé refusé.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de répondre à cette demande.");
    }
  }

  async function withdraw(id: string) {
    try {
      await cancel.mutateAsync(id);
      toast.success("Demande annulée.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'annuler cette demande.");
    }
  }

  const addButton = (
    <Button onClick={() => setOpen(true)}>
      <Plus />
      Demander un congé
    </Button>
  );

  const items = data ?? [];
  const busy = decide.isPending || cancel.isPending;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Demandes de congé</h2>
          <p className="text-sm text-muted-foreground">
            Les demandes en attente d&apos;abord, puis celles qui ont été répondues.
          </p>
        </div>
        {items.length > 0 && addButton}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Congés indisponibles"
          fallback="Les demandes de congé n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Palmtree}
          title="Aucune demande"
          description="Les congés demandés apparaîtront ici, en attente d'une réponse."
          action={addButton}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((leave) => (
            <li key={leave.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {!employeeId && (
                      <span className="font-medium text-foreground">{leave.employeeName}</span>
                    )}
                    <Badge variant="secondary">{leaveKindLabels[leave.kind]}</Badge>
                    <Badge variant={leaveStatusBadgeVariant[leave.status]}>
                      {leaveStatusLabels[leave.status]}
                    </Badge>
                  </div>

                  <p className={employeeId ? "text-sm text-foreground" : "mt-1 text-sm text-foreground"}>
                    {leave.startDate === leave.endDate
                      ? formatDateOnly(leave.startDate)
                      : `${formatDateOnly(leave.startDate)} au ${formatDateOnly(leave.endDate)}`}
                    {" · "}
                    {leave.hours !== null
                      ? `${leave.hours.toLocaleString("fr-CA", { maximumFractionDigits: 2 })} h`
                      : leave.days === 1
                        ? "1 jour"
                        : `${leave.days} jours`}
                  </p>

                  {leave.note && <p className="mt-1 text-sm text-muted-foreground">{leave.note}</p>}
                  {leave.decisionNote && (
                    <p className="mt-1 text-sm text-muted-foreground">Réponse : {leave.decisionNote}</p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {leave.status === "EnAttente" && canDecide && (
                    <>
                      <Button size="sm" disabled={busy} onClick={() => answer(leave.id, true)}>
                        <Check />
                        Approuver
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => answer(leave.id, false)}>
                        <X />
                        Refuser
                      </Button>
                    </>
                  )}
                  {leave.status !== "Annule" && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => withdraw(leave.id)}>
                      Annuler
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <LeaveSheet key={String(open)} employeeId={employeeId} open={open} onOpenChange={setOpen} />
    </div>
  );
}
