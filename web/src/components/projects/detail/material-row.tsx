"use client";

import { useId } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
import { ProductPicker } from "@/components/invoices/product-picker";
import { marginPercentFrom, sellingPriceFrom } from "@/lib/pricing";
import type { MarginMode, ProductSearchResult, SaveProjectMaterialValues } from "@/lib/types";

/**
 * The nine columns, shared by the headings and every row so the two cannot drift apart.
 * Below lg it collapses: a nine-column table on a telephone is a horizontal scrollbar nobody
 * uses, so each field carries its own label there instead.
 */
export const MATERIAL_GRID =
  "lg:grid-cols-[170px_minmax(0,1fr)_70px_80px_100px_80px_100px_110px_40px]";

/** Once, so the row's total and the table's footer round and punctuate the same way. */
export function formatMaterialAmount(amount: number): string {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function materialLineTotal(values: SaveProjectMaterialValues): number {
  return values.quantity * values.unitPrice;
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
 * One material line, edited in place.
 *
 * It owns no state: the values come in and every change goes straight back out, which is what
 * lets the same row serve a saved material and the blank draft at the bottom of the table.
 * `onCommit` is the save — called with the values rather than reading them back, because the
 * caller's state has not been updated yet at the moment the field is left.
 *
 * The arithmetic runs in one direction at a time, like the invoice lines: changing the cost or
 * the margin recomputes the selling price, typing a selling price recomputes the margin, and
 * the total is never editable because it is only ever quantity times selling price.
 */
export function MaterialRow({
  values,
  marginMode,
  onChange,
  onCommit,
  onRemove,
  removeLabel,
  disabled,
}: {
  values: SaveProjectMaterialValues;
  marginMode: MarginMode;
  onChange: (next: SaveProjectMaterialValues) => void;
  /** Save this row now. Left to the caller to decide whether that is a POST or a PUT. */
  onCommit: (next: SaveProjectMaterialValues) => void;
  onRemove: () => void;
  removeLabel: string;
  disabled?: boolean;
}) {
  const fieldId = useId();

  function patch(changes: Partial<SaveProjectMaterialValues>) {
    onChange({ ...values, ...changes });
  }

  /** Cost or margin moved, so the selling price follows. */
  function repriceFromMargin(purchasePrice: number | null, marginPercent: number | null) {
    const selling = sellingPriceFrom(purchasePrice, marginPercent, marginMode);
    patch({
      purchasePrice,
      marginPercent,
      ...(selling != null ? { unitPrice: selling } : {}),
    });
  }

  /** The selling price was typed, so the margin is whatever that implies. */
  function repriceFromSelling(unitPrice: number) {
    const margin = marginPercentFrom(values.purchasePrice, unitPrice, marginMode);
    patch({ unitPrice, ...(margin != null ? { marginPercent: margin } : {}) });
  }

  /**
   * A product fills the whole row and saves it at once. Waiting for a blur would be waiting
   * for a field nobody is going to visit: the picker's own input clears itself, so the choice
   * would sit there unsaved with nothing on screen saying so.
   *
   * The product's own margin is used as it stands. The project's price policy prices what is
   * invoiced; a material line is what the job consumed, and it is corrected by hand from here.
   */
  function onPickProduct(product: ProductSearchResult) {
    const margin = product.marginPercent ?? null;
    const selling =
      sellingPriceFrom(product.purchasePrice, margin, marginMode) ?? product.sellingPrice ?? 0;

    const next: SaveProjectMaterialValues = {
      ...values,
      productId: product.id,
      code: product.code,
      description: product.title,
      unit: product.unit,
      purchasePrice: product.purchasePrice,
      marginPercent: margin,
      unitPrice: selling,
    };

    onChange(next);
    onCommit(next);
  }

  const commit = () => onCommit(values);

  return (
    <div
      className={`grid gap-2 rounded-lg border border-border p-3 ${MATERIAL_GRID} lg:items-start lg:gap-2`}
    >
      <div className="space-y-2">
        <ProductPicker onPick={onPickProduct} placeholder="Chercher un produit…" />

        <Field>
          <FieldLabel htmlFor={`${fieldId}-code`} className="lg:sr-only">
            Code
          </FieldLabel>
          <Input
            id={`${fieldId}-code`}
            value={values.code ?? ""}
            placeholder="Code"
            disabled={disabled}
            // Typed over by hand, so the line is no longer that catalogue entry: the row keeps
            // what it says, and the product it claims to come from has to still be true.
            onChange={(event) =>
              patch({
                code: event.target.value === "" ? null : event.target.value,
                productId: null,
              })
            }
            onBlur={commit}
          />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor={`${fieldId}-description`} className="lg:sr-only">
          Description
          <RequiredMark />
        </FieldLabel>
        <Input
          id={`${fieldId}-description`}
          value={values.description}
          placeholder="Description"
          disabled={disabled}
          onChange={(event) => patch({ description: event.target.value })}
          onBlur={commit}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${fieldId}-unit`} className="lg:sr-only">
          Unité
        </FieldLabel>
        <Input
          id={`${fieldId}-unit`}
          value={values.unit ?? ""}
          placeholder="un"
          disabled={disabled}
          onChange={(event) => patch({ unit: event.target.value === "" ? null : event.target.value })}
          onBlur={commit}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${fieldId}-quantity`} className="lg:sr-only">
          Quantité
        </FieldLabel>
        <Input
          id={`${fieldId}-quantity`}
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          className="text-right"
          value={values.quantity}
          disabled={disabled}
          onChange={(event) => patch({ quantity: event.target.valueAsNumber || 0 })}
          onBlur={commit}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${fieldId}-purchase`} className="lg:sr-only">
          Prix d&apos;achat
        </FieldLabel>
        <Input
          id={`${fieldId}-purchase`}
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="—"
          className="text-right"
          value={fieldValue(values.purchasePrice)}
          disabled={disabled}
          onChange={(event) =>
            repriceFromMargin(numberOrNull(event.target.value), values.marginPercent)
          }
          onBlur={commit}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${fieldId}-margin`} className="lg:sr-only">
          Marge %
        </FieldLabel>
        <Input
          id={`${fieldId}-margin`}
          type="number"
          step="0.1"
          inputMode="decimal"
          placeholder="—"
          className="text-right"
          value={fieldValue(values.marginPercent)}
          disabled={disabled}
          onChange={(event) =>
            repriceFromMargin(values.purchasePrice, numberOrNull(event.target.value))
          }
          onBlur={commit}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${fieldId}-selling`} className="lg:sr-only">
          Prix vendant
        </FieldLabel>
        <Input
          id={`${fieldId}-selling`}
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          className="text-right"
          value={values.unitPrice}
          disabled={disabled}
          onChange={(event) => repriceFromSelling(event.target.valueAsNumber || 0)}
          onBlur={commit}
        />
      </Field>

      {/* Read, never typed: a total that can be edited is a total that stops agreeing with the
          two numbers beside it. */}
      <div className="flex items-center justify-between gap-2 lg:h-9 lg:justify-end">
        <span className="text-sm font-medium text-muted-foreground lg:sr-only">Total</span>
        <span className="text-sm tabular-nums text-foreground">
          {formatMaterialAmount(materialLineTotal(values))}
        </span>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={removeLabel}
        disabled={disabled}
        onClick={onRemove}
        className="justify-self-end"
      >
        <Trash2 />
      </Button>
    </div>
  );
}
