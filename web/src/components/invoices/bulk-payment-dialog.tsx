"use client";

import { useMemo, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ClientPicker } from "@/components/clients/client-picker";
import { NestedSheet } from "@/components/ui/sheet";
import { api, ApiError } from "@/lib/api";
import { formatDateOnly, todayIso } from "@/lib/dates";
import { paymentMethodLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import type { InvoicePayments, InvoiceRecord, PagedResult, PaymentMethod } from "@/lib/types";

/** The invoices a payment can still go against: given to the client, not settled, not undone. */
const OPEN: InvoiceRecord["status"][] = ["Envoyee", "PartiellementPayee", "EnRetard"];

const METHODS = (Object.keys(paymentMethodLabels) as PaymentMethod[]).filter((m) => m !== "PorteAuCompte");

/**
 * One payment over several invoices: a cheque that settles three of them. Pick the client, tick
 * the invoices, say how and when; each ticked invoice is paid in full and recorded at its own
 * amount, so every invoice keeps a payment of its own to trace.
 */
export function BulkPaymentButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Ajouter un paiement
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Inscrire un paiement</DialogTitle>
            <DialogDescription>
              Choisissez le client, puis la ou les factures payées. Chacune est réglée au complet et reçoit son propre
              montant.
            </DialogDescription>
          </DialogHeader>
          {open && <BulkPaymentForm onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function BulkPaymentForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [method, setMethod] = useState<PaymentMethod>("Cheque");
  const [date, setDate] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [pending, setPending] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", "a-payer", clientId],
    queryFn: () => api.get<PagedResult<InvoiceRecord>>(`invoices?clientId=${clientId}&page=1&pageSize=100`),
    enabled: Boolean(clientId),
  });
  const invoices = useMemo(() => (data?.items ?? []).filter((invoice) => OPEN.includes(invoice.status)), [data]);

  // What is still owed on each, from the same figures as the invoice's own payment panel.
  const states = useQueries({
    queries: invoices.map((invoice) => ({
      queryKey: ["invoices", "paiements", invoice.id],
      queryFn: () => api.get<InvoicePayments>(`invoices/${invoice.id}/paiements`),
    })),
  });
  const outstanding = (id: string) => {
    const index = invoices.findIndex((invoice) => invoice.id === id);
    return states[index]?.data?.outstanding ?? 0;
  };
  const owed = invoices.filter((invoice) => outstanding(invoice.id) > 0);
  const total = selected.reduce((sum, id) => sum + outstanding(id), 0);

  async function submit() {
    if (selected.length === 0) return;
    setPending(true);
    let done = 0;
    try {
      for (const id of selected) {
        const amount = outstanding(id);
        if (amount <= 0) continue;
        await api.post<InvoicePayments>(`invoices/${id}/paiements`, {
          amount,
          method,
          date: date || null,
          reference: reference.trim() || null,
          note: selected.length > 1 ? `Paiement groupé de ${selected.length} factures` : null,
        });
        done += 1;
      }
      toast.success(done === 1 ? "Paiement inscrit." : `${done} factures marquées payées.`);
      onDone();
    } catch (error) {
      toast.error(
        `${done > 0 ? `${done} paiement(s) inscrit(s), puis : ` : ""}${error instanceof ApiError ? error.message : "Impossible d'inscrire le paiement."}`,
      );
    } finally {
      setPending(false);
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["paiements"] });
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    }
  }

  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel htmlFor="bulk-payment-client">Client</FieldLabel>
        <NestedSheet>
          <ClientPicker
            id="bulk-payment-client"
            value={clientId}
            onChange={(next) => {
              setClientId(next);
              setSelected([]);
            }}
          />
        </NestedSheet>
      </Field>

      {clientId && (
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Factures à payer</p>
          {isLoading || states.some((state) => state.isLoading) ? (
            <Skeleton className="h-24 w-full" />
          ) : owed.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ce client n&apos;a aucune facture à payer.</p>
          ) : (
            <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {owed.map((invoice) => {
                const checked = selected.includes(invoice.id);
                return (
                  <li key={invoice.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) =>
                          setSelected((previous) =>
                            next === true ? [...previous, invoice.id] : previous.filter((id) => id !== invoice.id),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{invoice.number}</span>
                        <span className="text-muted-foreground"> · échéance {formatDateOnly(invoice.dueDate)}</span>
                      </span>
                      <span className="tabular-nums">{formatAmount(outstanding(invoice.id))}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="bulk-payment-method">Méthode</FieldLabel>
          <Select value={method} onValueChange={(value) => value && setMethod(value as PaymentMethod)}>
            <SelectTrigger id="bulk-payment-method" className="w-full">
              <SelectValue>{(value: PaymentMethod) => paymentMethodLabels[value]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {METHODS.map((option) => (
                <SelectItem key={option} value={option}>
                  {paymentMethodLabels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="bulk-payment-date">Date</FieldLabel>
          <Input id="bulk-payment-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="bulk-payment-reference">Référence</FieldLabel>
          <Input
            id="bulk-payment-reference"
            value={reference}
            maxLength={100}
            placeholder="N° de chèque"
            onChange={(event) => setReference(event.target.value)}
          />
        </Field>
      </div>

      <DialogFooter className="items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {selected.length === 0 ? "Aucune facture choisie" : `${selected.length} facture(s)`} · Total{" "}
          <span className="font-medium tabular-nums text-foreground">{formatAmount(total)}</span>
        </p>
        <Button onClick={submit} disabled={pending || selected.length === 0}>
          {pending && <Spinner />}
          Inscrire le paiement
        </Button>
      </DialogFooter>
    </div>
  );
}
