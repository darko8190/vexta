"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { Lock, Plus, Trash2, Wallet } from "lucide-react";
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
  useClientAccountQuery,
  useCreateAccountEntry,
  useDeleteAccountEntry,
} from "@/hooks/use-client-account";
import { ApiError } from "@/lib/api";
import { formatDateOnly, todayIso } from "@/lib/dates";
import { accountEntryKindLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import type { AccountEntryKind, ClientAccountEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ex } from "@/lib/placeholders";

const kinds: AccountEntryKind[] = ["Paiement", "Charge", "Ajustement"];

const formSchema = z.object({
  kind: z.enum(["Charge", "Paiement", "Ajustement"]),
  amount: z
    .string()
    .trim()
    .min(1, "Le montant est obligatoire.")
    .refine((value) => Number(value.replace(",", ".")) > 0, "Le montant doit être supérieur à zéro."),
  description: z
    .string()
    .trim()
    .min(1, "La description est obligatoire.")
    .max(300, "300 caractères maximum."),
  date: z.string().min(1, "La date est obligatoire."),
  reducesBalance: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * One client's running account: the balance, and the lines behind it.
 *
 * The balance is the sum of the lines and is never stored. Charges that come from an invoice are
 * written by taking a payment with the method "porté au compte", so this screen never has to
 * put one on by hand — what gets entered here is a payment received, an opening balance, or a
 * correction.
 */
export function ClientAccountSection({ clientId }: { clientId: string }) {
  const canManage = useCanManage();
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } =
    useClientAccountQuery(clientId);

  const remove = useDeleteAccountEntry(clientId);

  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClientAccountEntry | undefined>(undefined);

  const entries = data?.entries ?? [];
  const balance = data?.balance ?? 0;

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Ligne supprimée.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer cette ligne.");
    }
  }

  const addButton = canManage ? (
    <Button onClick={() => setFormOpen(true)}>
      <Plus />
      Inscrire une ligne
    </Button>
  ) : undefined;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Compte</h2>
          <p className="text-sm text-muted-foreground">
            Ce que ce client doit, et ce qu&apos;il a payé.
          </p>
        </div>
        {addButton}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        <LoadErrorState
          error={loadError}
          title="Compte indisponible"
          fallback="Le compte de ce client n'a pas pu être chargé."
          onRetry={() => refetch()}
        />
      ) : (
        <>
          {/* The balance leads, because it is the one figure anybody came here for. */}
          <dl className="mb-4 grid gap-4 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Solde</dt>
              <dd
                className={cn(
                  "text-lg font-semibold tabular-nums",
                  balance > 0 ? "text-destructive" : "text-foreground",
                )}
              >
                {formatAmount(balance)}
              </dd>
              <dd className="text-xs text-muted-foreground">
                {balance > 0
                  ? "Dû par le client"
                  : balance < 0
                    ? "Crédit en faveur du client"
                    : "Rien au compte"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Total porté au compte</dt>
              <dd className="text-foreground tabular-nums">{formatAmount(data?.totalCharged ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Total payé</dt>
              <dd className="text-foreground tabular-nums">{formatAmount(data?.totalPaid ?? 0)}</dd>
            </div>
          </dl>

          {(data?.isBlocked || data?.isAccountBlocked) && (
            <p
              className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="status"
            >
              <Lock className="mt-0.5 size-4 shrink-0" />
              <span>
                {data.isBlocked
                  ? data.blockedReason
                    ? `Ce client est bloqué : ${data.blockedReason}`
                    : "Ce client est bloqué."
                  : data.accountBlockedReason
                    ? `Le compte est bloqué : ${data.accountBlockedReason}`
                    : "Le compte est bloqué."}{" "}
                Rien de plus ne peut y être porté. Les paiements restent acceptés.
              </span>
            </p>
          )}

          {entries.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Aucun mouvement"
              description="Les factures portées au compte apparaîtront ici, avec les paiements reçus."
              action={addButton}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead className="w-28">Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-32 text-right">Montant</TableHead>
                    {canManage && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {formatDateOnly(entry.date)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={entry.amount < 0 ? "secondary" : "outline"}>
                          {accountEntryKindLabels[entry.kind]}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {entry.description}
                        {entry.invoiceNumber && (
                          <div className="text-xs font-normal text-muted-foreground">
                            Facture {entry.invoiceNumber}
                          </div>
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular-nums",
                          entry.amount < 0 && "text-muted-foreground",
                        )}
                      >
                        {formatAmount(entry.amount)}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          {/* A line that came from an invoice is undone on the invoice, not
                              here: the API refuses it, so no button offers it. */}
                          {!entry.invoiceId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Supprimer ${entry.description}`}
                              onClick={() => setDeleteTarget(entry)}
                            >
                              <Trash2 />
                            </Button>
                          )}
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

      <AccountEntrySheet open={formOpen} onOpenChange={setFormOpen} clientId={clientId} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => !next && setDeleteTarget(undefined)}
        title="Supprimer cette ligne ?"
        description={
          deleteTarget
            ? `« ${deleteTarget.description} » (${formatAmount(deleteTarget.amount)}) sera retirée du compte, et le solde changera d'autant.`
            : ""
        }
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}

/**
 * A line entered by hand.
 *
 * The amount field never shows a minus sign: the kind decides the direction, and an Ajustement
 * asks the question in words. A field where the sign matters is a field somebody gets backwards.
 */
function AccountEntrySheet({
  open,
  onOpenChange,
  clientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
}) {
  const create = useCreateAccountEntry(clientId);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      kind: "Paiement",
      amount: "",
      description: "",
      date: todayIso(),
      reducesBalance: true,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        kind: "Paiement",
        amount: "",
        description: "",
        date: todayIso(),
        reducesBalance: true,
      });
    }
  }, [open, form]);

  // useWatch, not form.watch(): the React Compiler cannot memoize a function the form hands
  // back, and the lint rules here refuse it rather than leave stale UI as a possibility.
  const kind = useWatch({ control: form.control, name: "kind" });

  async function onSubmit(values: FormValues) {
    try {
      await create.mutateAsync({
        kind: values.kind,
        amount: Number(values.amount.replace(",", ".")),
        description: values.description,
        date: values.date,
        reducesBalance: values.reducesBalance,
      });
      toast.success("Ligne inscrite.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'inscrire cette ligne.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Inscrire une ligne au compte</SheetTitle>
          <SheetDescription>
            Un paiement reçu, un solde d&apos;ouverture, une correction. Les factures portées au
            compte s&apos;inscrivent d&apos;elles-mêmes.
          </SheetDescription>
        </SheetHeader>

        <form
          id="account-entry-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="kind"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="entry-kind">Type</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="entry-kind" className="w-full">
                      <SelectValue>
                        {(value: AccountEntryKind) => accountEntryKindLabels[value]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {kinds.map((value) => (
                        <SelectItem key={value} value={value}>
                          {accountEntryKindLabels[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {field.value === "Paiement"
                      ? "Réduit le solde."
                      : field.value === "Charge"
                        ? "Augmente le solde."
                        : "Vous choisissez le sens ci-dessous."}
                  </FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="amount"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="entry-amount">Montant ($)</FieldLabel>
                  <Input
                    {...field}
                    id="entry-amount"
                    inputMode="decimal"
                    placeholder={ex("250,00")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>Toujours positif.</FieldDescription>
                  )}
                </Field>
              )}
            />

            {kind === "Ajustement" && (
              <Controller
                name="reducesBalance"
                control={form.control}
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Checkbox
                      id="entry-reduces"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                    <FieldLabel htmlFor="entry-reduces" className="font-normal">
                      Réduit le solde (crédit au client)
                    </FieldLabel>
                  </Field>
                )}
              />
            )}

            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="entry-description">Description</FieldLabel>
                  <Input
                    {...field}
                    id="entry-description"
                    placeholder={ex("Chèque 1042")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="date"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="entry-date">Date</FieldLabel>
                  <Input {...field} id="entry-date" type="date" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="account-entry-form" disabled={create.isPending}>
            {create.isPending && <Spinner />}
            Inscrire
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
