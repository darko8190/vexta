"use client";

import { Controller, type UseFormReturn } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductPicker } from "@/components/invoices/product-picker";
import { invoiceLineKindLabels } from "@/lib/labels";
import { marginPercentFrom, sellingPriceFrom } from "@/lib/pricing";
import type { InvoiceLineKind, MarginMode, ProductSearchResult } from "@/lib/types";

const KINDS = Object.keys(invoiceLineKindLabels) as InvoiceLineKind[];

/** The two kinds that are bought rather than typed, and so can be found in the catalogue. */
const CATALOGUE_KINDS: InvoiceLineKind[] = ["Materiaux", "Equipement"];

export interface LineValues {
  kind: InvoiceLineKind;
  productId: string | null;
  description: string;
  quantity: number;
  purchasePrice: number | null;
  marginPercent: number | null;
  unitPrice: number;
  isTaxable: boolean;
}

/** The slice of the invoice form these rows read and write. */
export interface LinesForm {
  lines: LineValues[];
}

function numberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function fieldValue(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

/**
 * The lines of an invoice, as a table with headings.
 *
 * Six numbers in a row with nothing above them is a puzzle — the columns are what make a
 * selling price readable as a selling price. The arithmetic between them runs in one direction
 * at a time: changing the cost or the margin recomputes the selling price, and typing a selling
 * price recomputes the margin, so whichever one was touched last is the one that is kept.
 */
export function InvoiceLineRows({
  form,
  fields,
  append,
  remove,
  marginMode,
  policyMarginPercent,
  hourlyRate,
  isTaxExempt,
  taxRateLabel,
}: {
  // The parent form carries more than these rows need; this is the part they touch. The cast
  // at the call site is what keeps the two from having to share one enormous type.
  form: UseFormReturn<LinesForm>;
  fields: { id: string }[];
  append: (line: LineValues) => void;
  remove: (index: number) => void;
  marginMode: MarginMode;
  /** The margin the chosen price policy applies to catalogue lines, if any. */
  policyMarginPercent: number | null;
  hourlyRate: number | null;
  isTaxExempt: boolean;
  /** "14,975 %" — shown, never edited: the rates belong to the company. */
  taxRateLabel: string;
}) {
  const lines = (form.watch("lines") ?? []) as LineValues[];

  function setLine(index: number, patch: Partial<LineValues>) {
    // Keyed rather than spread over the whole line: setting `lines.${index}` as one object
    // would replace fields the caller did not mention with undefined.
    for (const key of Object.keys(patch) as (keyof LineValues)[]) {
      const value = patch[key];
      if (value === undefined) continue;
      form.setValue(`lines.${index}.${key}`, value, { shouldDirty: true });
    }
  }

  /** Cost or margin moved, so the selling price follows. */
  function repriceFromMargin(index: number, purchasePrice: number | null, marginPercent: number | null) {
    const selling = sellingPriceFrom(purchasePrice, marginPercent, marginMode);
    setLine(index, {
      purchasePrice,
      marginPercent,
      ...(selling != null ? { unitPrice: selling } : {}),
    });
  }

  /** The selling price was typed, so the margin is whatever that implies. */
  function repriceFromSelling(index: number, unitPrice: number) {
    const line = lines[index];
    const margin = marginPercentFrom(line?.purchasePrice ?? null, unitPrice, marginMode);
    setLine(index, { unitPrice, ...(margin != null ? { marginPercent: margin } : {}) });
  }

  function onPickProduct(index: number, product: ProductSearchResult) {
    // The policy wins over the product's own margin: it is what this customer was promised.
    const margin = policyMarginPercent ?? product.marginPercent ?? null;
    const selling =
      sellingPriceFrom(product.purchasePrice, margin, marginMode) ?? product.sellingPrice ?? 0;

    setLine(index, {
      productId: product.id,
      description: product.title,
      purchasePrice: product.purchasePrice,
      marginPercent: margin,
      unitPrice: selling,
    });
  }

  function onKindChange(index: number, kind: InvoiceLineKind) {
    const patch: Partial<LineValues> = { kind };

    // Leaving the catalogue means the line is no longer that product, whatever it still says.
    if (!CATALOGUE_KINDS.includes(kind)) patch.productId = null;

    // Labour starts at the company's rate. Only when the line is still blank: overwriting a
    // price someone has typed because they changed the kind would be the form arguing back.
    if (kind === "MainDOeuvre" && hourlyRate != null && !lines[index]?.unitPrice) {
      patch.unitPrice = hourlyRate;
    }

    setLine(index, patch);
  }

  return (
    <div className="space-y-3">
      {/* The headings. Hidden below lg, where every field carries its own label instead —
          a seven-column table on a telephone is a horizontal scrollbar nobody uses. */}
      <div className="hidden items-end gap-2 px-3 text-xs font-medium text-muted-foreground lg:grid lg:grid-cols-[140px_minmax(0,1fr)_80px_110px_90px_110px_90px_40px]">
        <span>Type</span>
        <span>Description</span>
        <span className="text-right">Qté</span>
        <span className="text-right">Prix d&apos;achat</span>
        <span className="text-right">Marge %</span>
        <span className="text-right">Prix vendant</span>
        <span className="text-center">Taxable</span>
        <span />
      </div>

      {fields.map((lineField, index) => {
        const kind = (lines[index]?.kind ?? "Autre") as InvoiceLineKind;
        const fromCatalogue = CATALOGUE_KINDS.includes(kind);

        return (
          <div
            key={lineField.id}
            className="grid gap-2 rounded-lg border border-border p-3 lg:grid-cols-[140px_minmax(0,1fr)_80px_110px_90px_110px_90px_40px] lg:items-start lg:gap-2"
          >
            <Controller
              name={`lines.${index}.kind`}
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel className="lg:sr-only">Type</FieldLabel>
                  <Select
                    value={field.value || null}
                    onValueChange={(value) => onKindChange(index, (value ?? "Autre") as InvoiceLineKind)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(value: InvoiceLineKind) =>
                          value ? invoiceLineKindLabels[value] : "Type"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {KINDS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {invoiceLineKindLabels[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />

            <div className="space-y-2">
              {fromCatalogue && (
                <ProductPicker
                  onPick={(product) => onPickProduct(index, product)}
                  placeholder={kind === "Materiaux" ? "Chercher un matériau…" : "Chercher un équipement…"}
                />
              )}

              <Controller
                name={`lines.${index}.description`}
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel className="lg:sr-only">
                      Description
                      <RequiredMark />
                    </FieldLabel>
                    <Input {...field} placeholder="Description" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            <Controller
              name={`lines.${index}.quantity`}
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel className="lg:sr-only">Quantité</FieldLabel>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    className="text-right"
                    value={field.value}
                    onChange={(event) => field.onChange(event.target.valueAsNumber || 0)}
                  />
                </Field>
              )}
            />

            <Controller
              name={`lines.${index}.purchasePrice`}
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel className="lg:sr-only">Prix d&apos;achat</FieldLabel>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder="—"
                    className="text-right"
                    value={fieldValue(field.value)}
                    onChange={(event) =>
                      repriceFromMargin(
                        index,
                        numberOrNull(event.target.value),
                        lines[index]?.marginPercent ?? null,
                      )
                    }
                  />
                </Field>
              )}
            />

            <Controller
              name={`lines.${index}.marginPercent`}
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel className="lg:sr-only">Marge %</FieldLabel>
                  <Input
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    placeholder="—"
                    className="text-right"
                    value={fieldValue(field.value)}
                    onChange={(event) =>
                      repriceFromMargin(
                        index,
                        lines[index]?.purchasePrice ?? null,
                        numberOrNull(event.target.value),
                      )
                    }
                  />
                </Field>
              )}
            />

            <Controller
              name={`lines.${index}.unitPrice`}
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel className="lg:sr-only">Prix vendant</FieldLabel>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    className="text-right"
                    value={field.value}
                    onChange={(event) => repriceFromSelling(index, event.target.valueAsNumber || 0)}
                  />
                </Field>
              )}
            />

            <Controller
              name={`lines.${index}.isTaxable`}
              control={form.control}
              render={({ field }) => (
                <Field className="lg:items-center">
                  <FieldLabel className="lg:sr-only">Taxable</FieldLabel>
                  <div className="flex items-center gap-2 lg:flex-col lg:gap-1">
                    <Checkbox
                      checked={field.value}
                      // An exempt invoice taxes nothing, so the box cannot be ticked into
                      // contradicting the document it belongs to.
                      disabled={isTaxExempt}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      aria-label="Ligne taxable"
                    />
                    {/* The rate is the company's, shown so the line can be read and never
                        edited here: one line with its own rate is an invoice whose taxes
                        nobody can reconcile. */}
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {isTaxExempt ? "—" : field.value ? taxRateLabel : "0 %"}
                    </span>
                  </div>
                </Field>
              )}
            />

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Retirer la ligne"
              disabled={fields.length === 1}
              onClick={() => remove(index)}
              className="justify-self-end lg:mt-0"
            >
              <Trash2 />
            </Button>
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          append({
            kind: "Materiaux",
            productId: null,
            description: "",
            quantity: 1,
            purchasePrice: null,
            marginPercent: policyMarginPercent,
            unitPrice: 0,
            isTaxable: !isTaxExempt,
          })
        }
      >
        <Plus />
        Ajouter une ligne
      </Button>
    </div>
  );
}
