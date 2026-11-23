"use client";

import { useState } from "react";
import { Hourglass, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import {
  useAddHourBankEntry,
  useDeleteHourBankEntry,
  useHourBankQuery,
} from "@/hooks/use-employee-file";
import { ApiError } from "@/lib/api";
import { formatDateOnly, todayIso } from "@/lib/dates";
import { ex } from "@/lib/placeholders";
import type { HourBankEntry } from "@/lib/types";

/** Hours read as "14 h" or "3,5 h" — never "3.5", which is not how an hour is written here. */
function hours(value: number): string {
  return `${value.toLocaleString("fr-CA", { maximumFractionDigits: 2 })} h`;
}

function MovementSheet({
  employeeId,
  direction,
  open,
  onOpenChange,
}: {
  employeeId: string;
  /** Banking and taking are the same write with opposite signs, asked as two buttons. */
  direction: "banked" | "taken";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const add = useAddHourBankEntry(employeeId);

  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const banking = direction === "banked";

  async function onSubmit() {
    const value = Number(amount.replace(",", "."));

    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Entrez un nombre d'heures supérieur à zéro.");
      return;
    }
    if (!reason.trim()) {
      toast.error("Dites pourquoi : c'est ce qui rend la banque lisible dans six mois.");
      return;
    }

    try {
      await add.mutateAsync({ date, hours: banking ? value : -value, reason: reason.trim() });
      toast.success(banking ? "Heures mises en banque." : "Heures reprises.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer ce mouvement.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{banking ? "Mettre des heures en banque" : "Reprendre des heures"}</SheetTitle>
          <SheetDescription>
            {banking
              ? "Du temps supplémentaire qui sera repris plus tard plutôt que payé."
              : "Du temps pris sur la banque accumulée."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="bank-date">Date</FieldLabel>
              <Input id="bank-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>

            <Field>
              <FieldLabel htmlFor="bank-hours">Heures</FieldLabel>
              <Input
                id="bank-hours"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={ex("7,5")}
              />
              <FieldDescription>
                Toujours un nombre positif. Le sens est donné par le bouton que vous avez pressé.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="bank-reason">Raison</FieldLabel>
              <Input
                id="bank-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={banking ? ex("Samedi sur le chantier Lévis") : ex("Vendredi après-midi congé")}
              />
            </Field>
          </FieldGroup>
        </div>

        <SheetFooter>
          <Button type="button" onClick={onSubmit} disabled={add.isPending}>
            {add.isPending && <Spinner />}
            {banking ? "Mettre en banque" : "Reprendre"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Hours owed, as movements rather than a balance.
 *
 * A number in a column is something nobody can argue with and nobody can explain. A list of
 * movements answers "pourquoi j'ai quatorze heures" without anybody having to remember.
 */
export function HourBankSection({ employeeId }: { employeeId: string }) {
  const { data, isLoading, isError, error, refetch } = useHourBankQuery(employeeId);
  const remove = useDeleteHourBankEntry(employeeId);

  const [sheet, setSheet] = useState<"banked" | "taken" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HourBankEntry | undefined>(undefined);

  async function confirmDelete() {
    if (!deleteTarget) return;

    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Mouvement retiré.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de retirer ce mouvement.");
    }
  }

  const buttons = (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setSheet("banked")}>
        <Plus />
        Mettre en banque
      </Button>
      <Button variant="outline" onClick={() => setSheet("taken")}>
        <Minus />
        Reprendre
      </Button>
    </div>
  );

  const bank = data;
  const entries = bank?.entries ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Banque d&apos;heures</h2>
          <p className="text-sm text-muted-foreground">
            Le temps supplémentaire accumulé, et ce qui en a été repris.
          </p>
        </div>
        {buttons}
      </div>

      {bank && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-sm text-muted-foreground">Solde</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">{hours(bank.balance)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-sm text-muted-foreground">Accumulé</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">{hours(bank.banked)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-sm text-muted-foreground">Repris</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">{hours(bank.taken)}</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Banque indisponible"
          fallback="La banque d'heures n'a pas pu être chargée."
          onRetry={() => refetch()}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={Hourglass}
          title="Banque vide"
          description="Mettez des heures en banque quand du temps supplémentaire sera repris plutôt que payé."
          action={buttons}
        />
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <span
                  className={
                    "font-medium tabular-nums " +
                    (entry.hours > 0 ? "text-foreground" : "text-muted-foreground")
                  }
                >
                  {entry.hours > 0 ? "+" : "−"}
                  {hours(Math.abs(entry.hours))}
                </span>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {formatDateOnly(entry.date)} · {entry.reason}
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label="Retirer ce mouvement"
                onClick={() => setDeleteTarget(entry)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <MovementSheet
        key={sheet ?? "ferme"}
        employeeId={employeeId}
        direction={sheet ?? "banked"}
        open={sheet !== null}
        onOpenChange={(open) => !open && setSheet(null)}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Retirer ce mouvement ?"
        description="Le solde sera recalculé sans lui. Un mouvement venant d'un congé approuvé ne peut pas être retiré ici."
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
