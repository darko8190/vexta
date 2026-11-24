"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { Info, Plus, ReceiptText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { useCanManage } from "@/hooks/use-can-create";
import {
  useCreateInvoiceCredit,
  useDeleteInvoiceCredit,
  useInvoiceCreditsQuery,
} from "@/hooks/use-invoice-credits";
import { ApiError } from "@/lib/api";
import { formatDateOnly, todayIso } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { ex } from "@/lib/placeholders";
import type { InvoiceCredit } from "@/lib/types";

const formSchema = z.object({
  amount: z
    .string()
    .trim()
    .min(1, "Le montant est obligatoire.")
    .refine((value) => /^\d+([.,]\d{1,2})?$/.test(value.replace(/\s/g, "")), "Un montant s'écrit comme 80 ou 80,50.")
    .refine((value) => Number(value.replace(/\s/g, "").replace(",", ".")) > 0, "Le montant doit être supérieur à zéro."),
  reason: z.string().trim().min(1, "La raison est obligatoire : c'est ce que le client lira.").max(300, "300 caractères maximum."),
  date: z.string().min(1, "La date est obligatoire."),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * The credit notes on one invoice: what it no longer bills.
 *
 * Under the refunds, because that is the order things are squared in: money went back, and the
 * credit note says the invoice was smaller. Its own panel and its own number, never a negative
 * line on the invoice — the invoice was sent as it was, and the client holds that copy.
 */
export function InvoiceCreditsSection({
  invoiceId,
  cancelled,
}: {
  invoiceId: string;
  /** A cancelled invoice has nothing left to credit; the panel only shows what was. */
  cancelled?: boolean;
}) {
  const canManage = useCanManage();
  const { data, isLoading, isError, error, refetch } = useInvoiceCreditsQuery(invoiceId);
  const remove = useDeleteInvoiceCredit(invoiceId);

  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InvoiceCredit | undefined>(undefined);

  const credits = data?.credits ?? [];
  const creditable = data?.creditable ?? 0;
  const canCredit = canManage && !cancelled && creditable > 0;

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Note de crédit retirée.");
      setDeleteTarget(undefined);
    } catch (failure) {
      toast.error(failure instanceof ApiError ? failure.message : "Impossible de retirer cette note de crédit.");
    }
  }

  const addButton = canCredit ? (
    <Button variant="outline" onClick={() => setFormOpen(true)}>
      <Plus />
      Créditer
    </Button>
  ) : undefined;

  // A customer, or an invoice nobody can credit, with nothing credited: no empty panel.
  if (!isLoading && !isError && credits.length === 0 && !canCredit) return null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Notes de crédit</h2>
          <p className="text-sm text-muted-foreground">
            Ce que cette facture ne facture plus. Le document envoyé reste tel quel.
          </p>
        </div>
        {credits.length > 0 && addButton}
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Notes de crédit indisponibles"
          fallback="Les notes de crédit de cette facture n'ont pas pu être chargées."
          onRetry={() => void refetch()}
        />
      ) : credits.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="Aucune note de crédit"
          description="Un article jamais livré, un rabais consenti après coup : la note de crédit réduit ce que le client doit, taxes comprises."
          action={addButton}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Numéro</TableHead>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead>Raison</TableHead>
                  <TableHead className="w-32 text-right">Montant</TableHead>
                  {canManage && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {credits.map((credit) => (
                  <TableRow key={credit.id}>
                    <TableCell className="font-medium tabular-nums">{credit.number}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDateOnly(credit.date)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{credit.reason}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div className="font-medium">{formatAmount(credit.amount)}</div>
                      {/* The split is what the tax returns need; shown small, under the figure
                          the client agreed to. */}
                      {credit.gst + credit.qst > 0 && (
                        <div className="text-xs text-muted-foreground">
                          dont TPS {formatAmount(credit.gst)} · TVQ {formatAmount(credit.qst)}
                        </div>
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Retirer la note de crédit ${credit.number}`}
                          onClick={() => setDeleteTarget(credit)}
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
            Une note de crédit réduit ce que le client doit. Si la facture était déjà payée, le trop-perçu
            se rend par un remboursement.
          </p>
        </>
      )}

      {formOpen && (
        <CreditSheet
          open={formOpen}
          onOpenChange={setFormOpen}
          invoiceId={invoiceId}
          creditable={creditable}
        />
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => !next && setDeleteTarget(undefined)}
        title={`Retirer la note de crédit ${deleteTarget?.number ?? ""} ?`}
        description="La facture redevient due d'autant. Son numéro ne sera pas réutilisé. À faire seulement si elle n'a jamais été remise au client."
        pending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function CreditSheet({
  open,
  onOpenChange,
  invoiceId,
  creditable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  creditable: number;
}) {
  const create = useCreateInvoiceCredit(invoiceId);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { amount: "", reason: "", date: todayIso() },
  });

  useEffect(() => {
    if (open) form.reset({ amount: "", reason: "", date: todayIso() });
  }, [open, form]);

  async function onSubmit(values: FormValues) {
    try {
      const state = await create.mutateAsync({
        amount: Number(values.amount.replace(/\s/g, "").replace(",", ".")),
        reason: values.reason.trim(),
        date: values.date || null,
      });

      const issued = state.credits[0];
      toast.success(issued ? `Note de crédit ${issued.number} émise.` : "Note de crédit émise.");
      onOpenChange(false);
    } catch (failure) {
      toast.error(failure instanceof ApiError ? failure.message : "Impossible d'émettre cette note de crédit.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Créditer la facture</SheetTitle>
          <SheetDescription>
            Jusqu&apos;à {formatAmount(creditable)}, taxes comprises. La TPS et la TVQ sont réparties
            comme sur la facture.
          </SheetDescription>
        </SheetHeader>

        <form
          id="credit-form"
          onSubmit={(event) => {
            event.stopPropagation();
            return form.handleSubmit(onSubmit)(event);
          }}
          className="flex-1 overflow-y-auto px-4"
          noValidate
        >
          <FieldGroup>
            <Controller
              name="amount"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={Boolean(fieldState.error)}>
                  <FieldLabel htmlFor="credit-amount">Montant, taxes comprises</FieldLabel>
                  <Input
                    id="credit-amount"
                    inputMode="decimal"
                    placeholder={ex("80,00")}
                    aria-invalid={Boolean(fieldState.error)}
                    {...field}
                  />
                  <FieldDescription>
                    Maximum {formatAmount(creditable)}.{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={() =>
                        form.setValue("amount", creditable.toFixed(2).replace(".", ","), { shouldValidate: true })
                      }
                    >
                      Tout créditer
                    </button>
                  </FieldDescription>
                  {fieldState.error && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="reason"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={Boolean(fieldState.error)}>
                  <FieldLabel htmlFor="credit-reason">Raison</FieldLabel>
                  <Input
                    id="credit-reason"
                    placeholder={ex("Porte non installée")}
                    aria-invalid={Boolean(fieldState.error)}
                    {...field}
                  />
                  <FieldDescription>C&apos;est la ligne que le client lira.</FieldDescription>
                  {fieldState.error && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="date"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={Boolean(fieldState.error)}>
                  <FieldLabel htmlFor="credit-date">Date</FieldLabel>
                  <Input id="credit-date" type="date" aria-invalid={Boolean(fieldState.error)} {...field} />
                  {fieldState.error && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="credit-form" disabled={create.isPending}>
            {create.isPending && <Spinner />}
            Émettre la note de crédit
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
