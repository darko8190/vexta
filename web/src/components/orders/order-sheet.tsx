"use client";

import { ClientContactLinks } from "@/components/clients/client-contact-links";
import Link from "next/link";
import { CreditCard, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
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
import { LoadErrorState } from "@/components/layout/load-error-state";
import { useCanManage } from "@/hooks/use-can-create";
import { useChangeOrderStatus, useInvoiceOrder, useOrderQuery } from "@/hooks/use-orders";
import { customerOrderStatusLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import { formatMoment } from "@/lib/dates";
import type { CustomerOrderStatus } from "@/lib/types";

// Every state but the one that belongs to the payment: "Paiement à terminer" is Stripe's
// answer, not a shelf the counter can put an order on, and the API refuses it.
const STATES = (Object.keys(customerOrderStatusLabels) as CustomerOrderStatus[]).filter(
  (state) => state !== "EnAttenteDePaiement",
);

/**
 * One order: what was asked for, by whom, and what the company has done about it.
 *
 * The lines are read-only, always. An order is what the customer asked for; a company that
 * could edit it would be changing what somebody agreed to after the fact. What the company
 * decides to charge goes on the invoice, which it owns and may change freely — which is exactly
 * what the Facturer button is for.
 */
export function OrderSheet({
  open,
  onOpenChange,
  orderId,
  onInvoiced,
  onFailed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  onInvoiced: (invoiceNumber: string) => void;
  onFailed: (error: unknown) => void;
}) {
  const canManage = useCanManage();
  const { data, isLoading, isError, error, refetch } = useOrderQuery(orderId);
  const changeStatus = useChangeOrderStatus();
  const invoice = useInvoiceOrder();

  const order = data?.order;

  async function setStatus(status: CustomerOrderStatus) {
    try {
      await changeStatus.mutateAsync({ id: orderId, status });
    } catch (failure) {
      onFailed(failure);
    }
  }

  async function createInvoice() {
    try {
      const result = await invoice.mutateAsync(orderId);
      onInvoiced(result.order.invoiceNumber ?? "");
    } catch (failure) {
      onFailed(failure);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{order ? `Commande ${order.number}` : "Commande"}</SheetTitle>
          <SheetDescription>
            {order
              ? `Reçue le ${formatMoment(order.createdAt)}.`
              : "Ce qui a été commandé, et par qui."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : isError || !order || !data ? (
            <LoadErrorState error={error} onRetry={() => void refetch()} />
          ) : (
            <>
              <dl className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Client</dt>
                  <dd className="mt-0.5 text-sm">
                    <Link
                      href={`/clients/${order.clientId}`}
                      className="text-foreground hover:underline"
                    >
                      {order.clientName}
                    </Link>
                  </dd>
                </div>

                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Pour joindre</dt>
                  <dd className="mt-0.5 text-sm text-foreground">
                    {order.contactPhone || order.contactEmail ? (
                      <ClientContactLinks phone={order.contactPhone} email={order.contactEmail} className="flex-col items-start gap-y-0" />
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>

                {order.paidAt && (
                  <div className="min-w-0 sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Paiement</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground">
                      <CreditCard className="size-4 shrink-0" aria-hidden="true" />
                      Payée en ligne le {formatMoment(order.paidAt)} —{" "}
                      {formatAmount(order.amountPaid, order.currency)}
                    </dd>
                  </div>
                )}

                {order.invoiceNumber && (
                  <div className="min-w-0 sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Facture</dt>
                    <dd className="mt-0.5 text-sm">
                      <Link
                        href={`/factures/${order.invoiceId}`}
                        className="inline-flex items-center gap-1.5 text-foreground hover:underline"
                      >
                        <FileText className="size-4 shrink-0" aria-hidden="true" />
                        {order.invoiceNumber}
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>

              {data.note && (
                <div>
                  <h3 className="text-sm font-medium text-foreground">Mot du client</h3>
                  <p className="mt-1 whitespace-pre-line rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                    {data.note}
                  </p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-medium text-foreground">Articles</h3>

                <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                  {data.lines.map((line) => (
                    <li key={line.id} className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{line.description}</p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {line.quantity}
                          {line.unit ? ` ${line.unit}` : ""} × {formatAmount(line.unitPrice, order.currency)}
                        </p>
                      </div>
                      <p className="text-sm font-medium tabular-nums text-foreground">
                        {formatAmount(line.lineTotal, order.currency)}
                      </p>
                    </li>
                  ))}
                </ul>

                {/* The rates are the ones stored on the order, not today's: the customer was
                    shown this total and accepted it. */}
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Sous-total</dt>
                    <dd className="tabular-nums text-foreground">
                      {formatAmount(order.subtotal, order.currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Taxes</dt>
                    <dd className="tabular-nums text-foreground">
                      {formatAmount(order.taxTotal, order.currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1 font-medium">
                    <dt className="text-foreground">Total</dt>
                    <dd className="tabular-nums text-foreground">
                      {formatAmount(order.total, order.currency)}
                    </dd>
                  </div>
                </dl>
              </div>

              <Field>
                <FieldLabel htmlFor="order-status">État</FieldLabel>
                <Select
                  value={order.status}
                  disabled={changeStatus.isPending}
                  onValueChange={(value) => void setStatus((value ?? order.status) as CustomerOrderStatus)}
                >
                  <SelectTrigger id="order-status" className="w-full">
                    <SelectValue>
                      {(value: CustomerOrderStatus) => customerOrderStatusLabels[value]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {STATES.map((state) => (
                      <SelectItem key={state} value={state}>
                        {customerOrderStatusLabels[state]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Le client lit cet état dans son propre espace, ce qui est toute la raison de le
                  tenir à jour.
                </FieldDescription>
              </Field>

              {order.status === "Annulee" && <Badge variant="destructive">Annulée</Badge>}
            </>
          )}
        </div>

        <SheetFooter>
          {canManage && order && !order.invoiceId && order.status !== "Annulee" && (
            <Button type="button" onClick={() => void createInvoice()} disabled={invoice.isPending}>
              {invoice.isPending && <Spinner />}
              Facturer cette commande
            </Button>
          )}
          <SheetClose render={<Button type="button" variant="outline" />}>Fermer</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
