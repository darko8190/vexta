"use client";

import { Controller, type UseFormReturn } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReferenceSearchInput, type ReferencePick, type ReferenceSource } from "@/components/catalog/reference-search";
import { invoiceLineKindLabels } from "@/lib/labels";
import { marginPercentFrom, policyMarginFor, sellingPriceFrom } from "@/lib/pricing";
import type { InvoiceLineKind, MarginMode, PricePolicy } from "@/lib/types";

const KINDS = Object.keys(invoiceLineKindLabels) as InvoiceLineKind[];

/** The kinds that are looked up rather than typed, and where. */
const SOURCES: Partial<Record<InvoiceLineKind, ReferenceSource>> = {
  Materiaux: "produit",
  Equipement: "equipement",
  Assemblage: "assemblage",
};

/** Only a material is a catalogue product; the line keeps its id. */
const CATALOGUE_KINDS: InvoiceLineKind[] = ["Materiaux"];

/**
 * The columns, written once and shared by the headings and every row — two copies of a nine
 * column template is two things to keep in step, and they do not stay in step.
 */
const COLUMNS = "lg:grid-cols-[130px_minmax(0,1fr)_72px_100px_80px_100px_96px_80px_36px]";

/** The line total, without a symbol: the currency is stated once under the table. */
const amountFormat = new Intl.NumberFormat("fr-CA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

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
 * A column that has no answer on this line.
 *
 * A dash rather than an empty box: a box invites a number, and what an hour of labour cost the
 * company is payroll — not a figure anybody can type onto the client's invoice. The label stays
 * below lg, where the fields are read one under the other instead of as a table.
 */
function NotApplicable({ label }: { label: string }) {
  return (
    <Field>
      <FieldLabel className="lg:sr-only">{label}</FieldLabel>
      <p className="flex h-8 items-center justify-end px-2.5 text-sm tabular-nums text-muted-foreground">
        —
      </p>
    </Field>
  );
}

/**
 * The lines of an invoice, as a table with headings.
 *
 * Six numbers in a row with nothing above them is a puzzle — the columns are what make a
 * selling price readable as a selling price. The arithmetic between them runs in one direction
 * at a time: changing the cost or the margin recomputes the selling price, and typing a selling
 * price recomputes the margin, so whichever one was touched last is the one that is kept.
 *
 * A labour line is the same row read differently: description, hours, hourly rate, total. There
 * is no product to look up and no purchase price to state, so those two columns show a dash.
 */
export function InvoiceLineRows({
  form,
  fields,
  append,
  remove,
  marginMode,
  policy,
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
  /**
   * The chosen price policy, bands included. Undefined when the invoice names none, and a
   * catalogue line then prices from the product's own margin.
   */
  policy: PricePolicy | undefined;
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

  /**
   * The cost was typed, so the band it falls into may have changed with it.
   *
   * Only when the policy has bands. Without them the margin is the same whatever the cost, and
   * re-sending it would overwrite a percentage somebody typed by hand on this line for the sake
   * of no change at all.
   */
  function repriceFromCost(index: number, purchasePrice: number | null) {
    const banded = policy && policy.tiers.length > 0;
    const margin = banded
      ? policyMarginFor(policy, purchasePrice)
      : lines[index]?.marginPercent ?? null;

    repriceFromMargin(index, purchasePrice, margin);
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

  function onPickProduct(index: number, product: ReferencePick) {
    // The policy wins over the product's own margin: it is what this customer was promised.
    // Resolved against this product's cost, because a policy can charge a different percentage
    // by price band — 60 % on a 3 $ fitting, 20 % on a 900 $ door.
    const margin = policyMarginFor(policy, product.purchasePrice) ?? product.marginPercent ?? null;
    const selling =
      sellingPriceFrom(product.purchasePrice, margin, marginMode) ?? product.sellingPrice ?? 0;

    setLine(index, {
      productId: product.source === "produit" ? product.id : null,
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

    if (kind === "MainDOeuvre") {
      // Cleared, not merely hidden. The row shows a dash in these two columns from here on,
      // and a dash over a stored cost is a line whose margin nobody can explain later.
      patch.purchasePrice = null;
      patch.marginPercent = null;

      // Labour starts at the company's rate. Only when the line is still blank: overwriting a
      // price someone has typed because they changed the kind would be the form arguing back.
      if (hourlyRate != null && !lines[index]?.unitPrice) patch.unitPrice = hourlyRate;
    }

    setLine(index, patch);
  }

  return (
    <div className="space-y-3">
      {/* The headings. Hidden below lg, where every field carries its own label instead —
          a nine-column table on a telephone is a horizontal scrollbar nobody uses. */}
      <div
        className={`hidden items-end gap-2 px-3 text-xs font-medium text-muted-foreground lg:grid ${COLUMNS}`}
      >
        <span>Type</span>
        <span>Description</span>
        <span className="text-right">Qté</span>
        <span className="text-right">Prix d&apos;achat</span>
        <span className="text-right">Marge %</span>
        <span className="text-right">Prix vendant</span>
        <span className="text-right">Total</span>
        <span className="text-center">Taxable</span>
        <span />
      </div>

      {fields.map((lineField, index) => {
        const kind = (lines[index]?.kind ?? "Autre") as InvoiceLineKind;

        // Labour is sold by the hour, so the quantity is hours and the unit price is the rate.
        // Naming them so is the difference between a row that reads itself and one that has to
        // be decoded.
        const isLabour = kind === "MainDOeuvre";
        const quantityLabel = isLabour ? "Heures" : "Quantité";
        const unitPriceLabel = isLabour ? "Taux horaire" : "Prix vendant";

        const total = (Number(lines[index]?.quantity) || 0) * (Number(lines[index]?.unitPrice) || 0);

        return (
          <div
            key={lineField.id}
            className={`grid gap-2 rounded-lg border border-border p-3 lg:items-start lg:gap-2 ${COLUMNS}`}
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

            {/* One field: the description is where the reference is searched. */}
            <Controller
              name={`lines.${index}.description`}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel className="lg:sr-only">
                    Description
                    <RequiredMark />
                  </FieldLabel>
                  <ReferenceSearchInput
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onPick={(pick) => onPickProduct(index, pick)}
                    source={SOURCES[kind] ?? null}
                    placeholder={
                      kind === "Materiaux"
                        ? "Description ou matériau…"
                        : kind === "Equipement"
                          ? "Description ou équipement…"
                          : "Description ou assemblage…"
                    }
                    invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name={`lines.${index}.quantity`}
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel className="lg:sr-only">{quantityLabel}</FieldLabel>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    className="text-right"
                    aria-label={quantityLabel}
                    placeholder={isLabour ? "Heures" : undefined}
                    value={field.value}
                    onChange={(event) => field.onChange(event.target.valueAsNumber || 0)}
                  />
                </Field>
              )}
            />

            {/* Labour has neither: the catalogue does not price an hour, and the cost of one is
                payroll. A dash says so; two empty boxes would ask for it. */}
            {isLabour ? (
              <>
                <NotApplicable label="Prix d'achat" />
                <NotApplicable label="Marge %" />
              </>
            ) : (
              <>
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
                        aria-label="Prix d'achat"
                        value={fieldValue(field.value)}
                        onChange={(event) => repriceFromCost(index, numberOrNull(event.target.value))}
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
                        aria-label="Marge %"
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
              </>
            )}

            <Controller
              name={`lines.${index}.unitPrice`}
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel className="lg:sr-only">{unitPriceLabel}</FieldLabel>
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    className="text-right"
                    aria-label={unitPriceLabel}
                    placeholder={isLabour ? "Taux horaire" : undefined}
                    value={field.value}
                    onChange={(event) => repriceFromSelling(index, event.target.valueAsNumber || 0)}
                  />
                </Field>
              )}
            />

            {/* Computed, on every line and not only on labour: it is the column people look for
                first, and a table of unit prices that never states what the line comes to is a
                table everyone re-multiplies in their head. Never editable — a total that can
                disagree with its own quantity and price is a total nobody can trust. */}
            <Field>
              <FieldLabel className="lg:sr-only">Total</FieldLabel>
              <p className="flex h-8 items-center justify-end px-2.5 text-sm font-medium tabular-nums">
                {amountFormat.format(total)}
              </p>
            </Field>

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
            // The flat margin: a blank line has no cost yet, so no band can be read. It
            // follows the cost as soon as one is typed.
            marginPercent: policy?.marginPercent ?? null,
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
