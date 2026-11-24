"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
import { ProductPicker } from "@/components/invoices/product-picker";
import { useBillingSettingsQuery } from "@/hooks/use-billing-settings";
import { useMarginMode } from "@/hooks/use-products";
import { useSaveQuoteLine } from "@/hooks/use-quotes";
import { useWageClassificationsQuery } from "@/hooks/use-wage-classifications";
import { formatAmount } from "@/lib/money";
import { marginPercentFrom, sellingPriceFrom } from "@/lib/pricing";
import type { QuoteLine, QuoteLineKind } from "@/lib/types";

export const quoteLineCopy: Record<
  QuoteLineKind,
  { one: string; create: string; quantity: string; cost: string; price: string }
> = {
  Tache: {
    one: "tâche",
    create: "Nouvelle tâche",
    quantity: "Heures",
    cost: "Taux coûtant ($/h)",
    price: "Taux vendant ($/h)",
  },
  Materiel: {
    one: "matériau",
    create: "Nouveau matériau",
    quantity: "Quantité",
    cost: "Prix coûtant ($)",
    price: "Prix vendant ($)",
  },
  Frais: {
    one: "frais",
    create: "Nouveaux frais",
    quantity: "Quantité",
    cost: "Coût ($)",
    price: "Vendant ($)",
  },
};

interface Draft {
  description: string;
  code: string;
  unit: string;
  quantity: string;
  unitCost: string;
  margin: string;
  unitPrice: string;
  productId: string | null;
}

function toDraft(line: QuoteLine | undefined, kind: QuoteLineKind, defaultRate: number | null): Draft {
  return {
    description: line?.description ?? "",
    code: line?.code ?? "",
    unit: line?.unit ?? "",
    quantity: line ? String(line.quantity) : "1",
    unitCost: line?.unitCost != null ? String(line.unitCost) : "",
    margin: "",
    // A new labour line starts at the company's hourly rate: it is what most hours sell for.
    unitPrice: line ? String(line.unitPrice) : kind === "Tache" && defaultRate != null ? String(defaultRate) : "",
    productId: line?.productId ?? null,
  };
}

function numberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isNaN(parsed) ? null : parsed;
}

const NO_STEP = "aucun";

/**
 * Adds or edits one priced line of a quote. The three kinds share the arithmetic — a quantity,
 * a cost, a selling price, and the margin between them — and differ in what fills them: a
 * labour line can take its rates from a step of the quote's classification, a material from
 * the catalogue.
 */
export function QuoteLineFormSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  kind: QuoteLineKind;
  line?: QuoteLine;
  wageClassificationId?: string | null;
}) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <LineForm {...props} />
      </SheetContent>
    </Sheet>
  );
}

function LineForm({
  onOpenChange,
  quoteId,
  kind,
  line,
  wageClassificationId,
}: {
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  kind: QuoteLineKind;
  line?: QuoteLine;
  wageClassificationId?: string | null;
}) {
  const copy = quoteLineCopy[kind];
  const save = useSaveQuoteLine(quoteId);
  const mode = useMarginMode();
  const { data: settings } = useBillingSettingsQuery();
  const { data: classifications } = useWageClassificationsQuery();
  const steps =
    kind === "Tache"
      ? (classifications?.find((item) => item.id === wageClassificationId)?.steps ?? [])
      : [];

  // Initialised on mount: the sheet's content unmounts when it closes, so every opening starts
  // from the line as saved.
  const [draft, setDraft] = useState<Draft>(() => {
    const initial = toDraft(line, kind, settings?.defaultHourlyRate ?? null);
    initial.margin = formatMargin(numberOrNull(initial.unitCost), numberOrNull(initial.unitPrice));
    return initial;
  });
  const [stepId, setStepId] = useState<string>("");


  function formatMargin(cost: number | null, price: number | null): string {
    const margin = marginPercentFrom(cost, price, mode);
    return margin == null ? "" : String(Math.round(margin * 100) / 100);
  }

  function set(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function onCost(value: string) {
    const margin = numberOrNull(draft.margin);
    const price = margin != null ? sellingPriceFrom(numberOrNull(value), margin, mode) : null;
    set({ unitCost: value, ...(price != null ? { unitPrice: String(Math.round(price * 100) / 100) } : {}) });
  }

  function onMargin(value: string) {
    const price = sellingPriceFrom(numberOrNull(draft.unitCost), numberOrNull(value), mode);
    set({ margin: value, ...(price != null ? { unitPrice: String(Math.round(price * 100) / 100) } : {}) });
  }

  function onPrice(value: string) {
    set({ unitPrice: value, margin: formatMargin(numberOrNull(draft.unitCost), numberOrNull(value)) });
  }

  const quantity = numberOrNull(draft.quantity) ?? 0;
  const price = numberOrNull(draft.unitPrice) ?? 0;
  const total = Math.round(quantity * price * 100) / 100;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (!draft.description.trim()) {
      toast.error("La description est requise.");
      return;
    }
    if (quantity <= 0) {
      toast.error(`${copy.quantity} : une valeur supérieure à zéro est requise.`);
      return;
    }

    try {
      await save.mutateAsync({
        id: line?.id,
        values: {
          kind,
          description: draft.description.trim(),
          quantity,
          unitCost: numberOrNull(draft.unitCost),
          unitPrice: price,
          productId: draft.productId,
          code: draft.code.trim() || null,
          unit: draft.unit.trim() || null,
        },
      });
      toast.success(line ? "Ligne mise à jour." : "Ligne ajoutée.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer la ligne.");
    }
  }

  return (
    <>
        <SheetHeader>
          <SheetTitle>{line ? `Modifier ${kind === "Frais" ? "les frais" : `la ${copy.one}`}` : copy.create}</SheetTitle>
          <SheetDescription>Le total se calcule à partir de la quantité et du prix vendant.</SheetDescription>
        </SheetHeader>

        <form id="quote-line-form" className="flex-1 overflow-y-auto px-4" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            {kind === "Materiel" && (
              <Field>
                <FieldLabel htmlFor="quote-line-product">Produit du catalogue</FieldLabel>
                <ProductPicker
                  id="quote-line-product"
                  onPick={(product) => {
                    const cost = product.purchasePrice;
                    const selling = product.sellingPrice ?? 0;
                    setDraft((current) => ({
                      ...current,
                      productId: product.id,
                      code: product.code ?? "",
                      description: product.title,
                      unit: product.unit ?? "",
                      unitCost: cost != null ? String(cost) : "",
                      unitPrice: String(selling),
                      margin: formatMargin(cost, selling),
                    }));
                  }}
                />
                <FieldDescription>Facultatif : un matériau peut aussi être décrit à la main.</FieldDescription>
              </Field>
            )}

            {kind === "Tache" && steps.length > 0 && (
              <Field>
                <FieldLabel htmlFor="quote-line-step">Échelon</FieldLabel>
                <Select
                  value={stepId || null}
                  onValueChange={(value: string | null) => {
                    const step = steps.find((item) => item.id === value);
                    setStepId(step ? step.id : "");
                    if (!step) return;
                    setDraft((current) => ({
                      ...current,
                      unitCost: step.cost != null ? String(step.cost) : current.unitCost,
                      unitPrice: step.selling != null ? String(step.selling) : current.unitPrice,
                      margin: formatMargin(step.cost, step.selling),
                    }));
                  }}
                >
                  <SelectTrigger id="quote-line-step" className="w-full">
                    <SelectValue>
                      {(value: string) =>
                        steps.find((item) => item.id === value)?.name ?? "Choisir un échelon"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_STEP}>Aucun échelon</SelectItem>
                    {steps.map((step) => (
                      <SelectItem key={step.id} value={step.id}>
                        {step.name}
                        {step.selling != null && (
                          <span className="text-muted-foreground"> — {formatAmount(step.selling)}/h</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>Remplit les taux avec ceux du classement de la soumission.</FieldDescription>
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="quote-line-description">
                Description
                <RequiredMark />
              </FieldLabel>
              <Textarea
                id="quote-line-description"
                rows={2}
                value={draft.description}
                onChange={(event) => set({ description: event.target.value })}
              />
            </Field>

            {kind === "Materiel" && (
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="quote-line-code">Code</FieldLabel>
                  <Input id="quote-line-code" value={draft.code} onChange={(event) => set({ code: event.target.value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="quote-line-unit">Unité</FieldLabel>
                  <Input id="quote-line-unit" value={draft.unit} onChange={(event) => set({ unit: event.target.value })} />
                </Field>
              </div>
            )}

            <Field>
              <FieldLabel htmlFor="quote-line-quantity">
                {copy.quantity}
                <RequiredMark />
              </FieldLabel>
              <Input
                id="quote-line-quantity"
                type="number"
                step="0.25"
                min="0"
                value={draft.quantity}
                onChange={(event) => set({ quantity: event.target.value })}
              />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field>
                <FieldLabel htmlFor="quote-line-cost">{copy.cost}</FieldLabel>
                <Input
                  id="quote-line-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft.unitCost}
                  onChange={(event) => onCost(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="quote-line-margin">Marge (%)</FieldLabel>
                <Input
                  id="quote-line-margin"
                  type="number"
                  step="0.1"
                  value={draft.margin}
                  onChange={(event) => onMargin(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="quote-line-price">{copy.price}</FieldLabel>
                <Input
                  id="quote-line-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft.unitPrice}
                  onChange={(event) => onPrice(event.target.value)}
                />
              </Field>
            </div>

            <p className="text-sm text-muted-foreground">
              Total de la ligne : <span className="font-medium text-foreground tabular-nums">{formatAmount(total)}</span>
            </p>
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="quote-line-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {line ? "Enregistrer" : "Ajouter"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
    </>
  );
}
