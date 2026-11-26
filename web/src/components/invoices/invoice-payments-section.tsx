"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BanknoteArrowDown, Check, CircleCheck, Lock, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { useCanManage } from "@/hooks/use-can-create";
import {
  useCreateInvoicePayment,
  useDeleteInvoicePayment,
  useInvoicePaymentsQuery,
} from "@/hooks/use-invoice-payments";
import { ApiError } from "@/lib/api";
import { formatDateOnly, todayIso } from "@/lib/dates";
import { paymentMethodLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import type { InvoicePayment, PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

const methods: PaymentMethod[] = [
  "Comptant",
  "Interac",
  "Carte",
  "Cheque",
  "Virement",
  "PorteAuCompte",
  "Autre",
];


/**
 * What has been paid on one invoice, and what is left.
 *
 * The three figures come from the API together, worked out by the same arithmetic the printed
 * invoice uses — so a client who has paid what the paper says is paid in full here too. The
 * status follows: the API marks the invoice Payée when the payments cover the total, rather
 * than waiting for somebody to remember a dropdown.
 */
export function InvoicePaymentsSection({ invoiceId }: { invoiceId: string }) {
  const canManage = useCanManage();
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } =
    useInvoicePaymentsQuery(invoiceId);

  const remove = useDeleteInvoicePayment(invoiceId);

  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InvoicePayment | undefined>(undefined);

  const payments = data?.payments ?? [];
  const outstanding = data?.outstanding ?? 0;
  const refunded = data?.refunded ?? 0;
  const credited = data?.credited ?? 0;
  const tiles = 3 + (refunded > 0 ? 1 : 0) + (credited > 0 ? 1 : 0);
  const settled = Boolean(data) && outstanding <= 0;

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Paiement retiré.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de retirer ce paiement.");
    }
  }

  const addButton =
    canManage && !settled ? (
      <Button onClick={() => setAdding(true)} disabled={adding}>
        <Plus />
        Inscrire un paiement
      </Button>
    ) : undefined;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Paiements</h2>
          <p className="text-sm text-muted-foreground">
            Ce qui est entré sur cette facture, et ce qu&apos;il reste à encaisser.
          </p>
        </div>
        {addButton}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        <LoadErrorState
          error={loadError}
          title="Paiements indisponibles"
          fallback="Les paiements de cette facture n'ont pas pu être chargés."
          onRetry={() => refetch()}
        />
      ) : (
        <>
          <dl
            className={cn(
              "mb-4 grid gap-4 rounded-lg border border-border bg-card p-4 text-sm",
              tiles === 3 && "sm:grid-cols-3",
              tiles === 4 && "sm:grid-cols-2 lg:grid-cols-4",
              tiles === 5 && "sm:grid-cols-3 lg:grid-cols-5",
            )}
          >
            <div>
              <dt className="text-muted-foreground">Total de la facture</dt>
              <dd className="text-foreground tabular-nums">{formatAmount(data?.total ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Encaissé</dt>
              <dd className="text-foreground tabular-nums">{formatAmount(data?.paid ?? 0)}</dd>
            </div>
            {/* Shown only when there is some, and shown separately: without it the lines below
                would add up to more than the figure above them, with nothing to explain it. */}
            {refunded > 0 && (
              <div>
                <dt className="text-muted-foreground">Remboursé</dt>
                <dd className="text-foreground tabular-nums">{formatAmount(refunded)}</dd>
              </div>
            )}
            {/* Not money: what the client stopped owing. Shown so "reste à payer" can be
                worked out from the figures on screen. */}
            {credited > 0 && (
              <div>
                <dt className="text-muted-foreground">Crédité</dt>
                <dd className="text-foreground tabular-nums">{formatAmount(credited)}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Reste à payer</dt>
              <dd
                className={cn(
                  "text-lg font-semibold tabular-nums",
                  settled ? "text-foreground" : "text-destructive",
                )}
              >
                {formatAmount(outstanding)}
              </dd>
            </div>
          </dl>

          {settled && (
            <p
              className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
              role="status"
            >
              <CircleCheck className="size-4 shrink-0 text-primary" />
              Cette facture est réglée.
            </p>
          )}

          {data?.accountRefusal && (
            <p
              className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="status"
            >
              <Lock className="mt-0.5 size-4 shrink-0" />
              <span>{data.accountRefusal} « Porté au compte » n&apos;est pas disponible.</span>
            </p>
          )}

          {payments.length === 0 && !adding ? (
            <EmptyState
              icon={BanknoteArrowDown}
              title="Aucun paiement"
              description="Inscrivez l'argent reçu. Un acompte puis le solde, c'est deux lignes."
              action={addButton}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead className="w-40">Méthode</TableHead>
                    <TableHead>Référence</TableHead>
                    <TableHead className="w-32 text-right">Montant</TableHead>
                    {canManage && <TableHead className="w-20" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adding && (
                    <NewPaymentRow
                      invoiceId={invoiceId}
                      outstanding={outstanding}
                      accountRefusal={data?.accountRefusal ?? null}
                      onDone={() => setAdding(false)}
                    />
                  )}
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {formatDateOnly(payment.date)}
                      </TableCell>
                      <TableCell>
                        {/* Porté au compte stands out: it is the one method where no money
                            arrived, and the client now owes it on their account instead. */}
                        <Badge variant={payment.method === "PorteAuCompte" ? "outline" : "secondary"}>
                          {paymentMethodLabels[payment.method]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {payment.reference ?? "—"}
                        {payment.note && (
                          <div className="text-xs">{payment.note}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatAmount(payment.amount)}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Retirer le paiement du ${formatDateOnly(payment.date)}`}
                            onClick={() => setDeleteTarget(payment)}
                          >
                            <Trash2 />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}


      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => !next && setDeleteTarget(undefined)}
        title="Retirer ce paiement ?"
        description={
          deleteTarget
            ? `${formatAmount(deleteTarget.amount)} du ${formatDateOnly(deleteTarget.date)} seront retirés. Si c'était porté au compte, la charge disparaîtra aussi du compte du client.`
            : ""
        }
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}

/**
 * A payment typed straight into the table, where it will stay: date, method, reference, amount,
 * prefilled with today and what is left to pay. Entrée saves, Échap drops the line — no panel
 * hiding the invoice while the amount is being read off it.
 */
function NewPaymentRow({
  invoiceId,
  outstanding,
  accountRefusal,
  onDone,
}: {
  invoiceId: string;
  outstanding: number;
  accountRefusal: string | null;
  onDone: () => void;
}) {
  const create = useCreateInvoicePayment(invoiceId);
  const [date, setDate] = useState(todayIso());
  const [method, setMethod] = useState<PaymentMethod>("Comptant");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  // Prefilled with what is left, which is what gets entered nine times out of ten.
  const [amount, setAmount] = useState(outstanding > 0 ? outstanding.toFixed(2).replace(".", ",") : "");

  const parsed = Number(amount.replace(/\s/g, "").replace(",", "."));
  const valid = amount.trim() !== "" && Number.isFinite(parsed) && parsed > 0 && date !== "";

  async function save() {
    if (!valid || create.isPending) return;
    try {
      await create.mutateAsync({
        amount: parsed,
        method,
        date,
        reference: reference.trim() || null,
        note: note.trim() || null,
      });
      toast.success("Paiement inscrit.");
      onDone();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'inscrire ce paiement.");
    }
  }

  return (
    <TableRow
      className="bg-muted/30"
      onKeyDown={(event) => {
        if (event.key === "Escape") onDone();
        if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") {
          event.preventDefault();
          void save();
        }
      }}
    >
      <TableCell className="py-1.5 align-top">
        <Input type="date" aria-label="Date du paiement" value={date} onChange={(e) => setDate(e.target.value)} className="h-8" />
      </TableCell>
      <TableCell className="py-1.5 align-top">
        <Select value={method} onValueChange={(value) => value && setMethod(value as PaymentMethod)}>
          <SelectTrigger size="sm" aria-label="Méthode" className="w-full">
            <SelectValue>{(value: PaymentMethod) => paymentMethodLabels[value]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {methods.map((item) => (
              <SelectItem key={item} value={item} disabled={item === "PorteAuCompte" && Boolean(accountRefusal)}>
                {paymentMethodLabels[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-1.5 align-top">
        <div className="grid gap-1">
        <Input
          aria-label="Référence"
          placeholder="Référence (no de chèque…)"
          maxLength={80}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          className="h-8"
        />
        <Input
          aria-label="Note"
          placeholder="Note"
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="h-8"
        />
        </div>
      </TableCell>
      <TableCell className="py-1.5 align-top">
        <Input
          autoFocus
          inputMode="decimal"
          aria-label="Montant"
          aria-invalid={amount.trim() !== "" && !valid}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-8 min-w-24 text-right tabular-nums"
        />
      </TableCell>
      <TableCell className="py-1.5 align-top">
        <div className="flex gap-1">
          <Button size="icon-sm" aria-label="Enregistrer le paiement" onClick={() => void save()} disabled={!valid || create.isPending}>
            {create.isPending ? <Spinner /> : <Check />}
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Annuler" onClick={onDone}>
            <X />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
