"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ProjectPicker } from "@/components/invoices/project-picker";
import { useSavePurchaseOrder, useSuppliersQuery } from "@/hooks/use-suppliers";
import { ApiError } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { ex } from "@/lib/placeholders";
import type { PurchaseOrderDetail } from "@/lib/types";

/** A line being edited. The key is local and never sent: a new line has no id yet. */
interface Row {
  key: string;
  id: string | null;
  description: string;
  unit: string;
  quantity: string;
  unitCost: string;
  /** How much of this line has already arrived. Nothing can drop a line that has. */
  received: number;
}

function blankRow(): Row {
  return {
    key: `nouvelle-${Math.random().toString(36).slice(2)}`,
    id: null,
    description: "",
    unit: "",
    quantity: "1",
    unitCost: "",
    received: 0,
  };
}

function toRows(detail: PurchaseOrderDetail | undefined): Row[] {
  if (!detail) return [blankRow()];

  return detail.lines.map((line) => ({
    key: line.id,
    id: line.id,
    description: line.description,
    unit: line.unit ?? "",
    quantity: String(line.quantity),
    unitCost: String(line.unitCost),
    received: line.quantityReceived,
  }));
}

function parse(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * An order and its lines, written in one sitting.
 *
 * The lines are sent as a whole set rather than one request each: writing an order is adding,
 * renaming and removing in the same minute, and a screen that saved every keystroke would be a
 * screen where half a description is a line somebody ordered.
 */
export function PurchaseOrderSheet({
  open,
  onOpenChange,
  detail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail?: PurchaseOrderDetail;
}) {
  const isEditing = Boolean(detail);
  const save = useSavePurchaseOrder();
  const { data: suppliers } = useSuppliersQuery("");

  const [supplierId, setSupplierId] = useState(detail?.order.supplierId ?? "");
  const [projectId, setProjectId] = useState(detail?.order.projectId ?? "");
  const [orderedOn, setOrderedOn] = useState(detail?.order.orderedOn ?? todayIso());
  const [expectedOn, setExpectedOn] = useState(detail?.order.expectedOn ?? "");
  const [reference, setReference] = useState(detail?.order.reference ?? "");
  const [note, setNote] = useState(detail?.order.note ?? "");
  const [rows, setRows] = useState<Row[]>(() => toRows(detail));

  function edit(key: string, change: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  async function onSubmit() {
    if (!supplierId) {
      toast.error("Choisissez le fournisseur.");
      return;
    }

    const lines = rows.filter((row) => row.description.trim());
    if (lines.length === 0) {
      toast.error("Ajoutez au moins une ligne.");
      return;
    }
    if (lines.some((row) => parse(row.quantity) <= 0)) {
      toast.error("Chaque ligne a besoin d'une quantité supérieure à zéro.");
      return;
    }

    try {
      await save.mutateAsync({
        id: detail?.order.id ?? null,
        values: {
          supplierId,
          projectId: projectId || null,
          orderedOn,
          expectedOn: expectedOn || null,
          reference: reference.trim() || null,
          note: note.trim() || null,
          lines: lines.map((row) => ({
            id: row.id,
            productId: null,
            description: row.description.trim(),
            unit: row.unit.trim() || null,
            quantity: parse(row.quantity),
            unitCost: parse(row.unitCost),
          })),
        },
      });
      toast.success(isEditing ? "Commande enregistrée." : "Commande créée en brouillon.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer cette commande.");
    }
  }

  const total = rows.reduce((sum, row) => sum + parse(row.quantity) * parse(row.unitCost), 0);
  const choices = suppliers ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{isEditing ? `Commande ${detail!.order.number}` : "Nouvelle commande"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Les lignes déjà reçues ne peuvent pas être retirées : la réception pointerait vers rien."
              : "Elle part en brouillon. Vous l'enverrez quand elle sera prête."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="order-supplier">Fournisseur</FieldLabel>
                <Select value={supplierId} onValueChange={(value) => setSupplierId(value ?? "")}>
                  <SelectTrigger id="order-supplier" className="w-full">
                    <SelectValue placeholder="Choisir un fournisseur">
                      {(value: string) => choices.find((s) => s.id === value)?.name ?? "Choisir un fournisseur"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {choices.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="order-project">Projet</FieldLabel>
                <ProjectPicker id="order-project" value={projectId} onChange={setProjectId} />
                <FieldDescription>
                  Facultatif : une palette de vis qui s&apos;en va sur la tablette n&apos;est à personne.
                </FieldDescription>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="order-date">Commandée le</FieldLabel>
                <Input
                  id="order-date"
                  type="date"
                  value={orderedOn}
                  onChange={(event) => setOrderedOn(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="order-expected">Promise pour</FieldLabel>
                <Input
                  id="order-expected"
                  type="date"
                  value={expectedOn}
                  onChange={(event) => setExpectedOn(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="order-reference">Référence</FieldLabel>
                <Input
                  id="order-reference"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder={ex("SOUM-4821")}
                />
              </Field>
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-foreground">Lignes</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRows((current) => [...current, blankRow()])}
                >
                  <Plus />
                  Ajouter une ligne
                </Button>
              </div>

              <div className="space-y-3">
                {rows.map((row, index) => (
                  <div key={row.key} className="rounded-lg border border-border p-3">
                    <div className="grid gap-3 sm:grid-cols-[1fr_5rem_6rem_7rem_auto] sm:items-end">
                      <Field>
                        <FieldLabel htmlFor={`line-desc-${row.key}`}>Description</FieldLabel>
                        <Input
                          id={`line-desc-${row.key}`}
                          value={row.description}
                          onChange={(event) => edit(row.key, { description: event.target.value })}
                          placeholder={ex("2x6x12 épinette traitée")}
                        />
                      </Field>

                      <Field>
                        <FieldLabel htmlFor={`line-unit-${row.key}`}>Unité</FieldLabel>
                        <Input
                          id={`line-unit-${row.key}`}
                          value={row.unit}
                          onChange={(event) => edit(row.key, { unit: event.target.value })}
                          placeholder={ex("ch")}
                        />
                      </Field>

                      <Field>
                        <FieldLabel htmlFor={`line-qty-${row.key}`}>Quantité</FieldLabel>
                        <Input
                          id={`line-qty-${row.key}`}
                          inputMode="decimal"
                          value={row.quantity}
                          onChange={(event) => edit(row.key, { quantity: event.target.value })}
                        />
                      </Field>

                      <Field>
                        <FieldLabel htmlFor={`line-cost-${row.key}`}>Coût unitaire</FieldLabel>
                        <Input
                          id={`line-cost-${row.key}`}
                          inputMode="decimal"
                          value={row.unitCost}
                          onChange={(event) => edit(row.key, { unitCost: event.target.value })}
                          placeholder={ex("18,45")}
                        />
                      </Field>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Retirer la ligne ${index + 1}`}
                        disabled={row.received > 0}
                        onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                      >
                        <Trash2 />
                      </Button>
                    </div>

                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatAmount(parse(row.quantity) * parse(row.unitCost))}
                      {row.received > 0 &&
                        ` · ${row.received.toLocaleString("fr-CA", { maximumFractionDigits: 3 })} déjà reçu`}
                    </p>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-right text-sm font-medium text-foreground">
                Total avant taxes : <span className="tabular-nums">{formatAmount(total)}</span>
              </p>
            </div>

            <Field>
              <FieldLabel htmlFor="order-note">Note</FieldLabel>
              <Textarea
                id="order-note"
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={ex("Livrer au chantier, pas à la cour.")}
              />
            </Field>
          </FieldGroup>
        </div>

        <SheetFooter>
          <Button type="button" onClick={onSubmit} disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {isEditing ? "Enregistrer" : "Créer la commande"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
