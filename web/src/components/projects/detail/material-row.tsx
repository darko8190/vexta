"use client";

import { useId } from "react";
import Link from "next/link";
import { ExternalLink, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
import { ProductPicker } from "@/components/invoices/product-picker";
import { TaskPickerField } from "@/components/projects/detail/task-picker-field";
import { marginPercentFrom, sellingPriceFrom } from "@/lib/pricing";
import type { MarginMode, ProductSearchResult, SaveProjectMaterialValues } from "@/lib/types";

/**
 * The nine columns, shared by the headings and every row so the two cannot drift apart.
 * Below lg it collapses: a nine-column table on a telephone is a horizontal scrollbar nobody
 * uses, so each field carries its own label there instead.
 */
export const MATERIAL_GRID =
  "lg:grid-cols-[170px_minmax(0,1fr)_70px_80px_100px_80px_100px_110px_76px]";

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

/** An amount the line may never have carried: a cost nobody filled in is a dash, not $0,00. */
function amountOrDash(value: number | null | undefined): string {
  return value == null ? "—" : formatMaterialAmount(value);
}

/**
 * One cell of a frozen line. The heading sits above the table from lg; below that the columns
 * collapse, so the cell carries its own label the way the editable fields do.
 */
function ReadCell({
  label,
  value,
  numeric,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-center justify-between gap-2 ${numeric ? "lg:justify-end" : "lg:justify-start"}`}
    >
      <span className="text-sm font-medium text-muted-foreground lg:sr-only">{label}</span>
      <span className={`text-sm text-foreground ${numeric ? "tabular-nums" : "break-words"}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * One material line of a billed project, read only.
 *
 * Shown as text rather than as disabled inputs: these are the figures somebody is checking
 * against the invoice, and greyed-out fields read worse than a table. The columns are the same
 * ones, so every number still sits under its own heading.
 */
export function MaterialReadRow({
  values,
  taskTitle,
}: {
  values: SaveProjectMaterialValues;
  /** The task it was filed under, when it was filed under one. */
  taskTitle?: string | null;
}) {
  return (
    <div
      className={`grid gap-2 rounded-lg border border-border p-3 ${MATERIAL_GRID} lg:items-center lg:gap-2`}
    >
      <div className="min-w-0 space-y-1">
        <ReadCell label="Code" value={values.code ?? "—"} />
        {taskTitle && (
          <p className="truncate text-xs text-muted-foreground" title={taskTitle}>
            {taskTitle}
          </p>
        )}
      </div>
      <ReadCell label="Description" value={values.description} />
      <ReadCell label="Unité" value={values.unit ?? "—"} />
      <ReadCell label="Qté" value={String(values.quantity)} numeric />
      <ReadCell label="Prix d'achat" value={amountOrDash(values.purchasePrice)} numeric />
      <ReadCell
        label="Marge %"
        value={values.marginPercent == null ? "—" : `${values.marginPercent} %`}
        numeric
      />
      <ReadCell label="Prix vendant" value={formatMaterialAmount(values.unitPrice)} numeric />
      <ReadCell label="Total" value={formatMaterialAmount(materialLineTotal(values))} numeric />
      <div className="flex justify-end">
        <ProductLink productId={values.productId} />
      </div>
    </div>
  );
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
  projectId,
  marginMode,
  onChange,
  onCommit,
  onRemove,
  removeLabel,
  disabled,
}: {
  values: SaveProjectMaterialValues;
  projectId: string;
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

        <TaskPickerField
          id={`${fieldId}-task`}
          projectId={projectId}
          value={values.projectTaskId}
          compact
          // Committed on the spot rather than on blur like the text fields: a select has no
          // blur anybody expects, and a choice left unsaved with nothing on screen saying so is
          // the worst of both.
          onChange={(taskId) => {
            const next = { ...values, projectTaskId: taskId };
            onChange(next);
            onCommit(next);
          }}
        />
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

      <div className="flex items-center justify-end gap-1">
        <ProductLink productId={values.productId} />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={removeLabel}
          disabled={disabled}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

/** Straight to the catalogue file of the product a line was taken from. Nothing for a typed line. */
function ProductLink({ productId }: { productId: string | null }) {
  if (!productId) return null;
  return (
    <Link
      href={`/inventaire/produits/${productId}`}
      aria-label="Voir la fiche du produit"
      title="Voir la fiche du produit"
      className={buttonVariants({ variant: "ghost", size: "icon" })}
    >
      <ExternalLink />
    </Link>
  );
}
