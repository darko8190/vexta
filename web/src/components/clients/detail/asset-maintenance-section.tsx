"use client";

import { useState } from "react";
import { BellRing, CalendarCheck, CalendarClock, MoreHorizontal, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { useCanCreate } from "@/hooks/use-can-create";
import {
  type AssetMaintenance,
  useAssetMaintenanceQuery,
  useDeleteAssetMaintenance,
  useMarkMaintenanceDone,
  useSaveAssetMaintenance,
} from "@/hooks/use-client-assets";
import { ApiError } from "@/lib/api";
import { dayIso, formatDateOnly, formatMoment, todayIso } from "@/lib/dates";
import { ex } from "@/lib/placeholders";

/** The frequencies trades actually use, in months. */
const INTERVALS = [1, 2, 3, 4, 6, 12, 24] as const;

function intervalLabel(months: number): string {
  if (months === 1) return "Chaque mois";
  if (months === 12) return "Chaque année";
  if (months === 24) return "Aux deux ans";
  return `Aux ${months} mois`;
}

/** Days from today to an ISO date, negative once past. */
function daysUntil(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

function dueBadge(iso: string): { text: string; variant: "destructive" | "secondary" | "outline" } {
  const days = daysUntil(iso);
  if (days < 0) return { text: days === -1 ? "En retard d'un jour" : `En retard de ${-days} jours`, variant: "destructive" };
  if (days === 0) return { text: "Aujourd'hui", variant: "destructive" };
  if (days <= 30) return { text: days === 1 ? "Demain" : `Dans ${days} jours`, variant: "secondary" };
  return { text: `Le ${formatDateOnly(iso)}`, variant: "outline" };
}

/**
 * The maintenance planned on one asset: the next date of each, and — when asked — an email to
 * the client ahead of it so the appointment gets booked. « Fait » moves the date by the interval,
 * counted from the day it was done.
 */
export function AssetMaintenanceSection({ clientId, assetId }: { clientId: string; assetId: string }) {
  const canManage = useCanCreate();
  const { data, isLoading, isError, error, refetch } = useAssetMaintenanceQuery(clientId, assetId);
  const remove = useDeleteAssetMaintenance(clientId, assetId);
  const [editing, setEditing] = useState<AssetMaintenance | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [doneTarget, setDoneTarget] = useState<AssetMaintenance | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<AssetMaintenance | undefined>(undefined);

  function openNew() {
    setEditing(undefined);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Entretien retiré.");
      setDeleteTarget(undefined);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Impossible de retirer l'entretien.");
    }
  }

  const addButton = canManage ? (
    <Button onClick={openNew}>
      <Plus />
      Planifier un entretien
    </Button>
  ) : null;
  const items = data ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Entretiens</h2>
          <p className="text-sm text-muted-foreground">
            Ce qui revient à date fixe sur cet actif, et le rappel envoyé au client avant.
          </p>
        </div>
        {items.length > 0 && addButton}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Entretiens indisponibles"
          fallback="Les entretiens de cet actif n'ont pas pu être chargés."
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="Aucun entretien planifié"
          description="Planifiez l'entretien annuel ou le service aux six mois : Vexta garde la date et peut écrire au client avant."
          action={addButton}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const due = dueBadge(item.nextDue);
            return (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{item.label}</span>
                    <Badge variant={due.variant}>{due.text}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {[
                      intervalLabel(item.intervalMonths),
                      `prochain le ${formatDateOnly(item.nextDue)}`,
                      item.lastDoneOn ? `fait le ${formatDateOnly(item.lastDoneOn)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <BellRing className="size-3.5 shrink-0" />
                    {item.remindedAt
                      ? `Client avisé le ${formatMoment(item.remindedAt)}`
                      : item.remindDaysBefore
                        ? `Courriel au client ${item.remindDaysBefore} jours avant`
                        : "Pas de courriel au client"}
                  </p>
                  {item.notes && <p className="mt-1 text-sm text-muted-foreground">{item.notes}</p>}
                </div>

                {canManage && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => setDoneTarget(item)}>
                      <CalendarCheck />
                      Fait
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon" aria-label={`Actions sur ${item.label}`}>
                            <MoreHorizontal />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(item);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(item)}>
                          <Trash2 />
                          Retirer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <MaintenanceFormSheet
        key={`${editing?.id ?? "nouveau"}-${formOpen}`}
        open={formOpen}
        onOpenChange={setFormOpen}
        clientId={clientId}
        assetId={assetId}
        maintenance={editing}
      />

      {doneTarget && (
        <MarkDoneDialog
          clientId={clientId}
          assetId={assetId}
          maintenance={doneTarget}
          onClose={() => setDoneTarget(undefined)}
        />
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Retirer cet entretien ?"
        description={`« ${deleteTarget?.label ?? ""} » ne sera plus planifié, et le client ne recevra plus de rappel pour lui.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}

function MaintenanceFormSheet({
  open,
  onOpenChange,
  clientId,
  assetId,
  maintenance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  assetId: string;
  maintenance?: AssetMaintenance;
}) {
  const save = useSaveAssetMaintenance(clientId, assetId);
  const [label, setLabel] = useState(maintenance?.label ?? "");
  const [interval, setIntervalMonths] = useState(String(maintenance?.intervalMonths ?? 12));
  const [nextDue, setNextDue] = useState(maintenance?.nextDue ?? dayIso(365));
  const [remind, setRemind] = useState(maintenance ? maintenance.remindDaysBefore != null : true);
  const [remindDays, setRemindDays] = useState(String(maintenance?.remindDaysBefore ?? 14));
  const [notes, setNotes] = useState(maintenance?.notes ?? "");

  const days = Number(remindDays);
  const daysValid = !remind || (Number.isInteger(days) && days >= 1 && days <= 90);
  const valid = label.trim().length > 0 && Boolean(nextDue) && daysValid;

  async function onSubmit() {
    try {
      await save.mutateAsync({
        id: maintenance?.id,
        values: {
          label: label.trim(),
          intervalMonths: Number(interval),
          nextDue,
          remindDaysBefore: remind ? days : null,
          notes: notes.trim() || null,
        },
      });
      toast.success(maintenance ? "Entretien enregistré." : "Entretien planifié.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Impossible d'enregistrer l'entretien.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{maintenance ? "Modifier l'entretien" : "Planifier un entretien"}</SheetTitle>
          <SheetDescription>
            Quand il est fait, la prochaine date avance de la fréquence choisie.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="maintenance-label">Entretien</FieldLabel>
              <Input
                id="maintenance-label"
                maxLength={200}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={ex("Entretien annuel")}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="maintenance-interval">Fréquence</FieldLabel>
                <Select value={interval} onValueChange={(value) => setIntervalMonths(value ?? "12")}>
                  <SelectTrigger id="maintenance-interval" className="w-full">
                    <SelectValue>{(value: string) => intervalLabel(Number(value))}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVALS.map((months) => (
                      <SelectItem key={months} value={String(months)}>
                        {intervalLabel(months)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="maintenance-next">Prochain le</FieldLabel>
                <Input
                  id="maintenance-next"
                  type="date"
                  value={nextDue}
                  onChange={(event) => setNextDue(event.target.value)}
                />
              </Field>
            </div>
            <Field>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="maintenance-remind"
                  checked={remind}
                  onCheckedChange={(checked) => setRemind(checked === true)}
                />
                <FieldLabel htmlFor="maintenance-remind" className="font-normal">
                  Écrire au client avant la date
                </FieldLabel>
              </div>
            </Field>
            {remind && (
              <Field className="max-w-xs">
                <FieldLabel htmlFor="maintenance-remind-days">Combien de jours avant</FieldLabel>
                <Input
                  id="maintenance-remind-days"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={90}
                  value={remindDays}
                  onChange={(event) => setRemindDays(event.target.value)}
                  aria-invalid={!daysValid}
                />
                <FieldDescription>
                  {daysValid
                    ? "Un courriel à l'adresse du dossier client, avec vos coordonnées pour prendre rendez-vous."
                    : "Indiquez un nombre de jours entre 1 et 90."}
                </FieldDescription>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="maintenance-notes">Notes</FieldLabel>
              <Textarea
                id="maintenance-notes"
                rows={3}
                maxLength={2000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={ex("Filtre 16x25x1. Prévoir 1 h 30.")}
              />
            </Field>
          </FieldGroup>
        </div>

        <SheetFooter>
          <Button type="button" onClick={onSubmit} disabled={save.isPending || !valid}>
            {save.isPending && <Spinner />}
            {maintenance ? "Enregistrer" : "Planifier"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function MarkDoneDialog({
  clientId,
  assetId,
  maintenance,
  onClose,
}: {
  clientId: string;
  assetId: string;
  maintenance: AssetMaintenance;
  onClose: () => void;
}) {
  const markDone = useMarkMaintenanceDone(clientId, assetId);
  const [doneOn, setDoneOn] = useState(todayIso());

  async function submit() {
    try {
      const updated = await markDone.mutateAsync({ id: maintenance.id, doneOn });
      toast.success(`Fait. Prochain le ${formatDateOnly(updated.nextDue)}.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Impossible de marquer l'entretien comme fait.");
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Marquer « {maintenance.label} » comme fait</DialogTitle>
          <DialogDescription>
            Le prochain sera {intervalLabel(maintenance.intervalMonths).toLowerCase()} après cette date.
          </DialogDescription>
        </DialogHeader>
        <div className="px-4">
          <Field>
            <FieldLabel htmlFor="maintenance-done-on">
              <CalendarClock className="size-4" />
              Fait le
            </FieldLabel>
            <Input
              id="maintenance-done-on"
              type="date"
              max={todayIso()}
              value={doneOn}
              onChange={(event) => setDoneOn(event.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" onClick={submit} disabled={markDone.isPending || !doneOn}>
            {markDone.isPending && <Spinner />}
            Marquer fait
          </Button>
          <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
