"use client";

import { useState } from "react";
import { BadgeDollarSign, Plus, Trash2 } from "lucide-react";
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
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { useAddWage, useDeleteWage, useWagesQuery } from "@/hooks/use-employee-file";
import { ApiError } from "@/lib/api";
import { formatDateOnly, todayIso } from "@/lib/dates";
import { wageKindLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import { ex } from "@/lib/placeholders";
import type { EmployeeWage, WageKind } from "@/lib/types";

const kinds = Object.keys(wageKindLabels) as WageKind[];

function WageSheet({
  employeeId,
  open,
  onOpenChange,
}: {
  employeeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const add = useAddWage(employeeId);

  const [effectiveOn, setEffectiveOn] = useState(todayIso());
  const [kind, setKind] = useState<WageKind>("Horaire");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  async function onSubmit() {
    const value = Number(amount.replace(",", "."));

    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Entrez un montant supérieur à zéro.");
      return;
    }

    try {
      await add.mutateAsync({ effectiveOn, kind, amount: value, note: note.trim() || null });
      toast.success("Taux enregistré.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer ce taux.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Nouveau taux</SheetTitle>
          <SheetDescription>
            Une augmentation est une nouvelle ligne, jamais une correction de l&apos;ancienne :
            c&apos;est ce qui permet d&apos;expliquer une paie de l&apos;an dernier.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="wage-effective">En vigueur le</FieldLabel>
              <Input
                id="wage-effective"
                type="date"
                value={effectiveOn}
                onChange={(event) => setEffectiveOn(event.target.value)}
              />
              <FieldDescription>
                Une date future est permise : le taux prend effet tout seul ce jour-là.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="wage-kind">Type</FieldLabel>
              <Select value={kind} onValueChange={(value) => setKind((value ?? "Horaire") as WageKind)}>
                <SelectTrigger id="wage-kind" className="w-full">
                  <SelectValue>{(value: WageKind) => wageKindLabels[value]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {kinds.map((value) => (
                    <SelectItem key={value} value={value}>
                      {wageKindLabels[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="wage-amount">
                {kind === "Horaire" ? "Montant par heure" : "Montant par année"}
              </FieldLabel>
              <Input
                id="wage-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={kind === "Horaire" ? ex("32,50") : ex("68 000")}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="wage-note">Raison</FieldLabel>
              <Input
                id="wage-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={ex("Révision annuelle")}
              />
            </Field>
          </FieldGroup>
        </div>

        <SheetFooter>
          <Button type="button" onClick={onSubmit} disabled={add.isPending}>
            {add.isPending && <Spinner />}
            Enregistrer le taux
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * What this person is paid, and what they were paid before.
 *
 * A history rather than a field. Overwriting a rate makes last spring's hours cost what this
 * spring's do, and the invoice they were billed on stops adding up.
 */
export function WagesSection({ employeeId }: { employeeId: string }) {
  const { data, isLoading, isError, error, refetch } = useWagesQuery(employeeId);
  const remove = useDeleteWage(employeeId);

  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeWage | undefined>(undefined);

  async function confirmDelete() {
    if (!deleteTarget) return;

    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Taux retiré.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de retirer ce taux.");
    }
  }

  const addButton = (
    <Button onClick={() => setOpen(true)}>
      <Plus />
      Nouveau taux
    </Button>
  );

  const items = data ?? [];
  const current = items.find((wage) => wage.isCurrent);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Salaires</h2>
          <p className="text-sm text-muted-foreground">
            {current
              ? `Aujourd'hui : ${formatAmount(current.amount)} ${current.kind === "Horaire" ? "de l'heure" : "par année"}.`
              : "Aucun taux en vigueur."}
          </p>
        </div>
        {items.length > 0 && addButton}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Salaires indisponibles"
          fallback="L'historique des taux n'a pas pu être chargé."
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={BadgeDollarSign}
          title="Aucun taux"
          description="Inscrivez le taux de départ. Chaque augmentation s'ajoutera par-dessus, sans effacer l'ancienne."
          action={addButton}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((wage) => (
            <li
              key={wage.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium tabular-nums text-foreground">
                    {formatAmount(wage.amount)}
                  </span>
                  <Badge variant="secondary">{wageKindLabels[wage.kind]}</Badge>
                  {wage.isCurrent && <Badge variant="default">En vigueur</Badge>}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {[`Depuis le ${formatDateOnly(wage.effectiveOn)}`, wage.note].filter(Boolean).join(" · ")}
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label="Retirer ce taux"
                onClick={() => setDeleteTarget(wage)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <WageSheet key={String(open)} employeeId={employeeId} open={open} onOpenChange={setOpen} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => !next && setDeleteTarget(undefined)}
        title="Retirer ce taux ?"
        description="L'historique est ce qui explique une paie passée. Ne retirez une ligne que si elle a été saisie par erreur."
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
