"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { BanknoteArrowDown, CircleCheck, Lock, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ex } from "@/lib/placeholders";

const methods: PaymentMethod[] = [
  "Comptant",
  "Interac",
  "Carte",
  "Cheque",
  "Virement",
  "PorteAuCompte",
  "Autre",
];

const formSchema = z.object({
  amount: z
    .string()
    .trim()
    .min(1, "Le montant est obligatoire.")
    .refine((value) => Number(value.replace(",", ".")) > 0, "Le montant doit être supérieur à zéro."),
  method: z.enum(["Comptant", "Interac", "Carte", "Cheque", "Virement", "PorteAuCompte", "Autre"]),
  date: z.string().min(1, "La date est obligatoire."),
  reference: z.string().trim().max(80, "80 caractères maximum."),
  note: z.string().trim().max(300, "300 caractères maximum."),
});

type FormValues = z.infer<typeof formSchema>;

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

  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InvoicePayment | undefined>(undefined);

  const payments = data?.payments ?? [];
  const outstanding = data?.outstanding ?? 0;
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
      <Button onClick={() => setFormOpen(true)}>
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
          <dl className="mb-4 grid gap-4 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Total de la facture</dt>
              <dd className="text-foreground tabular-nums">{formatAmount(data?.total ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Encaissé</dt>
              <dd className="text-foreground tabular-nums">{formatAmount(data?.paid ?? 0)}</dd>
            </div>
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

          {payments.length === 0 ? (
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
                    {canManage && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
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

      <PaymentSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        invoiceId={invoiceId}
        outstanding={outstanding}
        accountRefusal={data?.accountRefusal ?? null}
      />

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

function PaymentSheet({
  open,
  onOpenChange,
  invoiceId,
  outstanding,
  accountRefusal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  outstanding: number;
  accountRefusal: string | null;
}) {
  const create = useCreateInvoicePayment(invoiceId);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: "",
      method: "Comptant",
      date: todayIso(),
      reference: "",
      note: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        // Prefilled with what is left, which is what gets entered nine times out of ten. Typed
        // with a comma because that is how an amount is written in fr-CA.
        amount: outstanding > 0 ? outstanding.toFixed(2).replace(".", ",") : "",
        method: "Comptant",
        date: todayIso(),
        reference: "",
        note: "",
      });
    }
  }, [open, outstanding, form]);

  async function onSubmit(values: FormValues) {
    try {
      await create.mutateAsync({
        amount: Number(values.amount.replace(",", ".")),
        method: values.method,
        date: values.date,
        reference: values.reference || null,
        note: values.note || null,
      });
      toast.success("Paiement inscrit.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'inscrire ce paiement.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Inscrire un paiement</SheetTitle>
          <SheetDescription>
            Il reste {formatAmount(outstanding)} à encaisser sur cette facture.
          </SheetDescription>
        </SheetHeader>

        <form
          id="payment-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="amount"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="payment-amount">Montant ($)</FieldLabel>
                  <Input
                    {...field}
                    id="payment-amount"
                    inputMode="decimal"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>
                      Un acompte se saisit en changeant ce montant.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />

            <Controller
              name="method"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="payment-method">Méthode</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="payment-method" className="w-full">
                      <SelectValue>
                        {(value: PaymentMethod) => paymentMethodLabels[value]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {methods.map((method) => (
                        <SelectItem
                          key={method}
                          value={method}
                          // Offered but refused would cost a round trip to learn what the panel
                          // already knows.
                          disabled={method === "PorteAuCompte" && Boolean(accountRefusal)}
                        >
                          {paymentMethodLabels[method]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {field.value === "PorteAuCompte"
                      ? "La facture est réglée et le montant s'ajoute au compte du client."
                      : "L'argent est entré."}
                  </FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="date"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="payment-date">Date</FieldLabel>
                  <Input {...field} id="payment-date" type="date" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="reference"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="payment-reference">Référence</FieldLabel>
                  <Input
                    {...field}
                    id="payment-reference"
                    placeholder={ex("Numéro de chèque, code d'autorisation")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="note"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="payment-note">Note</FieldLabel>
                  <Input {...field} id="payment-note" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="payment-form" disabled={create.isPending}>
            {create.isPending && <Spinner />}
            Inscrire le paiement
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
