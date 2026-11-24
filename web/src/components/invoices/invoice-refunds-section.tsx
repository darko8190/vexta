"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { CreditCard, Info, Plus, Trash2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { useCanManage } from "@/hooks/use-can-create";
import {
  useCreateInvoiceRefund,
  useDeleteInvoiceRefund,
  useInvoiceRefundsQuery,
} from "@/hooks/use-invoice-refunds";
import { ApiError } from "@/lib/api";
import { formatDateOnly, todayIso } from "@/lib/dates";
import { paymentMethodLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import { ex } from "@/lib/placeholders";
import type { InvoiceRefund, PaymentMethod, RefundablePayment } from "@/lib/types";

/** Everything but "porté au compte": no money arrived, so none can be given back. */
const methods: PaymentMethod[] = ["Comptant", "Interac", "Carte", "Cheque", "Virement", "Autre"];

const NONE = "aucun";

const formSchema = z.object({
  paymentId: z.string(),
  amount: z
    .string()
    .trim()
    .min(1, "Le montant est obligatoire.")
    .refine((value) => Number(value.replace(",", ".")) > 0, "Le montant doit être supérieur à zéro."),
  method: z.enum(["Comptant", "Interac", "Carte", "Cheque", "Virement", "Autre"]),
  online: z.boolean(),
  date: z.string().min(1, "La date est obligatoire."),
  reference: z.string().trim().max(80, "80 caractères maximum."),
  note: z.string().trim().max(300, "300 caractères maximum."),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * What has been given back on one invoice.
 *
 * Its own panel under the payments, not a negative line among them. A refund has its own date,
 * its own reason and often its own method, and a day's takings have to add up — which they
 * cannot if one column holds both directions.
 *
 * Giving money back does not change what the invoice bills. The amount outstanding goes back
 * up, and that is meant to show: the paperwork is not square until a credit note says the
 * invoice itself is smaller.
 */
export function InvoiceRefundsSection({ invoiceId }: { invoiceId: string }) {
  const canManage = useCanManage();
  const { data, isLoading, isError, error, refetch } = useInvoiceRefundsQuery(invoiceId);
  const remove = useDeleteInvoiceRefund(invoiceId);

  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InvoiceRefund | undefined>(undefined);

  const refunds = data?.refunds ?? [];
  const refundable = data?.refundable ?? 0;

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Remboursement retiré.");
      setDeleteTarget(undefined);
    } catch (failure) {
      toast.error(
        failure instanceof ApiError ? failure.message : "Impossible de retirer ce remboursement.",
      );
    }
  }

  const addButton =
    canManage && refundable > 0 ? (
      <Button variant="outline" onClick={() => setFormOpen(true)}>
        <Plus />
        Rembourser
      </Button>
    ) : undefined;

  // Nothing to show and nothing to do: an invoice nobody has paid has no business carrying an
  // empty refunds panel under its payments.
  if (!isLoading && !isError && refunds.length === 0 && refundable <= 0) return null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Remboursements</h2>
          <p className="text-sm text-muted-foreground">
            L&apos;argent rendu sur cette facture. Ce qu&apos;elle facture ne change pas.
          </p>
        </div>
        {addButton}
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Remboursements indisponibles"
          fallback="Les remboursements de cette facture n'ont pas pu être chargés."
          onRetry={() => void refetch()}
        />
      ) : refunds.length === 0 ? (
        <EmptyState
          icon={Undo2}
          title="Aucun remboursement"
          description={`Il y a ${formatAmount(refundable)} encaissés sur cette facture. Un remboursement les rend sans réécrire ce qui a été facturé.`}
          action={addButton}
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-40">Méthode</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead className="w-32 text-right">Montant</TableHead>
                  {canManage && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {refunds.map((refund) => (
                  <TableRow key={refund.id}>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDateOnly(refund.date)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{paymentMethodLabels[refund.method]}</Badge>
                      {/* A refund Stripe really sent is marked, because it is the one that
                          cannot be taken back from this screen. */}
                      {refund.stripeRefundId && (
                        <Badge variant="outline" className="ml-1">
                          <CreditCard className="size-3" aria-hidden="true" />
                          Stripe
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {refund.reference ?? "—"}
                      {refund.note && <div className="text-xs">{refund.note}</div>}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatAmount(refund.amount)}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={Boolean(refund.stripeRefundId)}
                          aria-label={`Retirer le remboursement du ${formatDateOnly(refund.date)}`}
                          onClick={() => setDeleteTarget(refund)}
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

          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Un remboursement ne réduit pas ce qui a été facturé : le montant dû remonte d&apos;autant.
            Pour que la facture elle-même baisse, il faudra une note de crédit.
          </p>
        </>
      )}

      <RefundSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        invoiceId={invoiceId}
        refundable={refundable}
        payments={data?.payments ?? []}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => !next && setDeleteTarget(undefined)}
        title="Retirer ce remboursement ?"
        description="La facture redeviendra réglée d'autant. À faire seulement si l'argent n'est jamais sorti."
        pending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

/**
 * One refund being written down, or sent back through the card.
 *
 * The payment comes first on the form rather than the amount, because it is the answer that
 * decides the rest: how much can go back, whether Stripe can send it, and what method it was.
 */
function RefundSheet({
  open,
  onOpenChange,
  invoiceId,
  refundable,
  payments,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  refundable: number;
  payments: RefundablePayment[];
}) {
  const create = useCreateInvoiceRefund(invoiceId);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      paymentId: NONE,
      amount: "",
      method: "Comptant",
      online: false,
      date: todayIso(),
      reference: "",
      note: "",
    },
  });

  const paymentId = useWatch({ control: form.control, name: "paymentId" });
  const online = useWatch({ control: form.control, name: "online" });
  const chosen = payments.find((p) => p.id === paymentId);
  const ceiling = chosen?.remaining ?? refundable;

  // Reset on each opening rather than on close, so a sheet that failed keeps what was typed
  // while it is still on screen.
  useEffect(() => {
    if (!open) return;

    const only = payments.length === 1 ? payments[0] : undefined;

    form.reset({
      paymentId: only?.id ?? NONE,
      amount: "",
      method: only?.online ? "Carte" : "Comptant",
      online: only?.online ?? false,
      date: todayIso(),
      reference: "",
      note: "",
    });
  }, [open, payments, form]);

  async function onSubmit(values: FormValues) {
    try {
      await create.mutateAsync({
        amount: Number(values.amount.replace(",", ".")),
        method: values.method,
        invoicePaymentId: values.paymentId === NONE ? null : values.paymentId,
        date: values.date || null,
        reference: values.reference.trim() || null,
        note: values.note.trim() || null,
        online: values.online,
      });

      toast.success(values.online ? "Remboursement envoyé par Stripe." : "Remboursement inscrit.");
      onOpenChange(false);
    } catch (failure) {
      toast.error(
        failure instanceof ApiError ? failure.message : "Impossible d'inscrire ce remboursement.",
      );
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Rembourser</SheetTitle>
          <SheetDescription>
            Jusqu&apos;à {formatAmount(refundable)} — ce qui est resté chez vous sur cette facture.
          </SheetDescription>
        </SheetHeader>

        <form
          id="refund-form"
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex-1 overflow-y-auto px-4"
        >
          <FieldGroup>
            <Controller
              name="paymentId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="refund-payment">Quel paiement</FieldLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value: string | null) => {
                      const next = value ?? NONE;
                      field.onChange(next);

                      // The method follows the payment, and so does the Stripe option: a card
                      // payment given back by cheque is possible, but it is not the default.
                      const target = payments.find((p) => p.id === next);
                      form.setValue("online", target?.online ?? false);
                      form.setValue("method", target?.online ? "Carte" : form.getValues("method"));
                    }}
                  >
                    <SelectTrigger id="refund-payment">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Aucun en particulier</SelectItem>
                      {payments.map((payment) => (
                        <SelectItem key={payment.id} value={payment.id}>
                          {formatDateOnly(payment.date)} — {paymentMethodLabels[payment.method]} —{" "}
                          {formatAmount(payment.remaining)}
                          {payment.online ? " (carte Vexta)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {chosen
                      ? `Il reste ${formatAmount(chosen.remaining)} à rendre sur ce paiement.`
                      : "Pour rendre une somme sans la rattacher à un paiement précis."}
                  </FieldDescription>
                </Field>
              )}
            />

            {chosen?.online && (
              <Controller
                name="online"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="refund-online"
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                      />
                      <FieldLabel htmlFor="refund-online">Renvoyer sur la carte</FieldLabel>
                    </div>
                    <FieldDescription>
                      Stripe renvoie l&apos;argent sur la carte qui a payé, en quelques jours.
                      Décochez si vous rendez la somme autrement et voulez seulement l&apos;inscrire.
                    </FieldDescription>
                  </Field>
                )}
              />
            )}

            <Controller
              name="amount"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={Boolean(fieldState.error)}>
                  <FieldLabel htmlFor="refund-amount">Montant</FieldLabel>
                  <Input
                    id="refund-amount"
                    inputMode="decimal"
                    placeholder={ex("150,00")}
                    aria-invalid={Boolean(fieldState.error)}
                    {...field}
                  />
                  <FieldDescription>
                    Maximum {formatAmount(ceiling)}.{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={() => form.setValue("amount", String(ceiling).replace(".", ","))}
                    >
                      Tout rendre
                    </button>
                  </FieldDescription>
                  {fieldState.error && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="method"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="refund-method">Comment</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={online}>
                    <SelectTrigger id="refund-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {methods.map((method) => (
                        <SelectItem key={method} value={method}>
                          {paymentMethodLabels[method]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {online && (
                    <FieldDescription>
                      Fixé à « Carte » : c&apos;est Stripe qui renvoie l&apos;argent.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />

            <Controller
              name="date"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={Boolean(fieldState.error)}>
                  <FieldLabel htmlFor="refund-date">Date</FieldLabel>
                  <Input id="refund-date" type="date" aria-invalid={Boolean(fieldState.error)} {...field} />
                  {fieldState.error && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="reference"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="refund-reference">Référence</FieldLabel>
                  <Input id="refund-reference" placeholder={ex("Chèque 412")} {...field} />
                </Field>
              )}
            />

            <Controller
              name="note"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="refund-note">Pourquoi</FieldLabel>
                  <Input id="refund-note" placeholder={ex("Matériaux retournés")} {...field} />
                  <FieldDescription>
                    Quelqu&apos;un le demandera dans six mois.
                  </FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="refund-form" disabled={create.isPending}>
            {create.isPending && <Spinner />}
            {online ? "Renvoyer sur la carte" : "Inscrire le remboursement"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
