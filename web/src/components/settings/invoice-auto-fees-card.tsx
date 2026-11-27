"use client";

import { useState } from "react";
import { Plus, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import {
  useDeleteInvoiceAutoFee,
  useInvoiceAutoFeesQuery,
  useSaveInvoiceAutoFee,
  type InvoiceAutoFee,
  type InvoiceAutoFeeValues,
} from "@/hooks/use-auto-fees";
import { ApiError } from "@/lib/api";
import { formatAmount } from "@/lib/money";

const GRID = "sm:grid-cols-[minmax(0,1fr)_80px_110px_80px_70px_40px]";

const blank: InvoiceAutoFeeValues = { description: "", quantity: 1, unitPrice: 0, isTaxable: true, isActive: true };

/**
 * The lines every new invoice starts with — an administration fee, an environmental charge.
 * Edited in place; each row is saved as it is left. The invoice can still drop one before it
 * is sent.
 */
export function InvoiceAutoFeesCard() {
  const { data, isLoading } = useInvoiceAutoFeesQuery();
  const save = useSaveInvoiceAutoFee();
  const remove = useDeleteInvoiceAutoFee();
  const [edits, setEdits] = useState<Record<string, InvoiceAutoFeeValues>>({});
  const [draft, setDraft] = useState<InvoiceAutoFeeValues | null>(null);
  const [deleting, setDeleting] = useState<InvoiceAutoFee | null>(null);

  const valuesOf = (fee: InvoiceAutoFee): InvoiceAutoFeeValues => edits[fee.id] ?? fee;

  async function commit(id: string | undefined, values: InvoiceAutoFeeValues) {
    if (!values.description.trim() || values.quantity <= 0) return;
    try {
      await save.mutateAsync({ id, values });
      if (!id) setDraft(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer ce frais.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success("Frais retiré.");
      setDeleting(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de retirer ce frais.");
    }
  }

  const fees = data ?? [];

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="size-4" />
          Frais automatiques
        </CardTitle>
        <CardDescription>
          Des lignes ajoutées d&apos;elles-mêmes à chaque nouvelle facture. Vous pouvez encore les retirer de la
          facture avant de l&apos;envoyer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <>
            {fees.length > 0 && (
              <div className={`hidden gap-2 px-2 text-xs font-medium text-muted-foreground sm:grid ${GRID}`}>
                <span>Description</span>
                <span className="text-right">Qté</span>
                <span className="text-right">Prix</span>
                <span />
                <span />
                <span />
              </div>
            )}
            {fees.map((fee) => (
              <Row
                key={fee.id}
                values={valuesOf(fee)}
                onChange={(next) => setEdits((previous) => ({ ...previous, [fee.id]: next }))}
                onCommit={(next) => void commit(fee.id, next)}
                onRemove={() => setDeleting(fee)}
              />
            ))}
            {draft && (
              <Row
                values={draft}
                onChange={setDraft}
                onCommit={(next) => void commit(undefined, next)}
                onRemove={() => setDraft(null)}
              />
            )}
            {fees.length === 0 && !draft && (
              <p className="text-sm text-muted-foreground">Aucun frais automatique : les factures commencent vides.</p>
            )}
            <div className="flex items-center justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setDraft({ ...blank })} disabled={Boolean(draft)}>
                <Plus />
                Ajouter un frais
              </Button>
              {fees.some((fee) => fee.isActive) && (
                <p className="text-sm text-muted-foreground">
                  Ajouté à chaque facture :{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatAmount(
                      fees.filter((fee) => fee.isActive).reduce((sum, fee) => sum + fee.quantity * fee.unitPrice, 0),
                    )}
                  </span>
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Retirer ce frais ?"
        description={`« ${deleting?.description ?? ""} » ne sera plus ajouté aux nouvelles factures. Les factures déjà faites ne changent pas.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </Card>
  );
}

/** One fee, edited in place. Outside the card so its fields keep focus across renders. */
function Row({ values, onChange, onCommit, onRemove }: {
  values: InvoiceAutoFeeValues;
  onChange: (next: InvoiceAutoFeeValues) => void;
  onCommit: (next: InvoiceAutoFeeValues) => void;
  onRemove: () => void;
}) {
  return (
    <div className={`grid items-center gap-2 rounded-lg border border-border p-2 ${GRID}`}>
      <Input
        aria-label="Description"
        placeholder="Frais d'administration"
        value={values.description}
        onChange={(event) => onChange({ ...values, description: event.target.value })}
        onBlur={() => onCommit(values)}
      />
      <Input
        aria-label="Quantité"
        type="number"
        min="0"
        step="0.01"
        className="text-right"
        value={values.quantity}
        onChange={(event) => onChange({ ...values, quantity: event.target.valueAsNumber || 0 })}
        onBlur={() => onCommit(values)}
      />
      <Input
        aria-label="Prix"
        type="number"
        step="0.01"
        className="text-right"
        value={values.unitPrice}
        onChange={(event) => onChange({ ...values, unitPrice: event.target.valueAsNumber || 0 })}
        onBlur={() => onCommit(values)}
      />
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Checkbox
          checked={values.isTaxable}
          onCheckedChange={(checked) => {
            const next = { ...values, isTaxable: checked === true };
            onChange(next);
            onCommit(next);
          }}
        />
        Taxable
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Checkbox
          checked={values.isActive}
          onCheckedChange={(checked) => {
            const next = { ...values, isActive: checked === true };
            onChange(next);
            onCommit(next);
          }}
        />
        Actif
      </label>
      <Button variant="ghost" size="icon" aria-label="Retirer ce frais" onClick={onRemove}>
        <Trash2 />
      </Button>
    </div>
  );
}
