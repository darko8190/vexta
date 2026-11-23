"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useCreateGoodsReceipt, useOutstandingLinesQuery } from "@/hooks/use-suppliers";
import { ApiError } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import { ex } from "@/lib/placeholders";

function parse(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Noting a delivery against an order.
 *
 * It opens on what is still owed, not on what was ordered: three of the five beams arriving on
 * Tuesday and two on Friday is the normal case, and a form that pre-filled the original
 * quantities would have somebody receive the same beams twice.
 *
 * Overshooting is allowed. Suppliers send a full box rather than the eleven that were asked
 * for, and refusing to record that would put the shelf and the screen out of step from the
 * first delivery.
 */
export function GoodsReceiptSheet({
  open,
  onOpenChange,
  orderId,
  orderNumber,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: number;
}) {
  const { data: outstanding, isLoading } = useOutstandingLinesQuery(open ? orderId : undefined);
  const create = useCreateGoodsReceipt();

  const [receivedOn, setReceivedOn] = useState(todayIso());
  const [slipNumber, setSlipNumber] = useState("");
  const [note, setNote] = useState("");

  // Keyed by line id, seeded from what is still owed the first time the list arrives. Empty
  // string means "nothing arrived on this line", which is different from a zero somebody typed.
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const lines = outstanding ?? [];

  function valueFor(lineId: string, fallback: number): string {
    return quantities[lineId] ?? (fallback > 0 ? String(fallback) : "");
  }

  async function onSubmit() {
    const picked = lines
      .map((line) => ({ line, quantity: parse(valueFor(line.purchaseOrderLineId, line.outstanding)) }))
      .filter((entry) => entry.quantity > 0);

    if (picked.length === 0) {
      toast.error("Dites ce qui est arrivé : une réception vide ne note rien.");
      return;
    }

    try {
      await create.mutateAsync({
        purchaseOrderId: orderId,
        receivedOn,
        slipNumber: slipNumber.trim() || null,
        note: note.trim() || null,
        lines: picked.map((entry) => ({
          purchaseOrderLineId: entry.line.purchaseOrderLineId,
          quantity: entry.quantity,
        })),
      });
      toast.success("Réception enregistrée.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer cette réception.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Réception sur la commande {orderNumber}</SheetTitle>
          <SheetDescription>
            Les quantités proposées sont ce qui reste à recevoir. Corrigez-les si le camion a
            apporté autre chose.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="receipt-date">Reçu le</FieldLabel>
                <Input
                  id="receipt-date"
                  type="date"
                  value={receivedOn}
                  onChange={(event) => setReceivedOn(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="receipt-slip">Bon de livraison</FieldLabel>
                <Input
                  id="receipt-slip"
                  value={slipNumber}
                  onChange={(event) => setSlipNumber(event.target.value)}
                  placeholder={ex("BL-99217")}
                />
              </Field>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-foreground">Ce qui est arrivé</h3>

              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">Cette commande n&apos;a aucune ligne.</p>
              ) : (
                <div className="space-y-2">
                  {lines.map((line) => (
                    <div
                      key={line.purchaseOrderLineId}
                      className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_8rem] sm:items-end"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{line.description}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          Commandé {line.ordered.toLocaleString("fr-CA", { maximumFractionDigits: 3 })}
                          {line.unit ? ` ${line.unit}` : ""} · reçu{" "}
                          {line.received.toLocaleString("fr-CA", { maximumFractionDigits: 3 })} · reste{" "}
                          {line.outstanding.toLocaleString("fr-CA", { maximumFractionDigits: 3 })}
                        </p>
                      </div>

                      <Field>
                        <FieldLabel htmlFor={`receipt-${line.purchaseOrderLineId}`}>Reçu</FieldLabel>
                        <Input
                          id={`receipt-${line.purchaseOrderLineId}`}
                          inputMode="decimal"
                          value={valueFor(line.purchaseOrderLineId, line.outstanding)}
                          onChange={(event) =>
                            setQuantities((current) => ({
                              ...current,
                              [line.purchaseOrderLineId]: event.target.value,
                            }))
                          }
                        />
                      </Field>
                    </div>
                  ))}
                </div>
              )}

              <FieldDescription className="mt-2">
                Laissez une ligne vide ou à zéro si rien n&apos;est arrivé pour elle.
              </FieldDescription>
            </div>

            <Field>
              <FieldLabel htmlFor="receipt-note">Note</FieldLabel>
              <Textarea
                id="receipt-note"
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={ex("Deux planches fendues, retournées au fournisseur.")}
              />
            </Field>
          </FieldGroup>
        </div>

        <SheetFooter>
          <Button type="button" onClick={onSubmit} disabled={create.isPending || isLoading}>
            {create.isPending && <Spinner />}
            Enregistrer la réception
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
