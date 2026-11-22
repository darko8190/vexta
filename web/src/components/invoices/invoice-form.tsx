"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import Link from "next/link";
import { ClientPicker } from "@/components/clients/client-picker";
import { ProjectPicker } from "@/components/invoices/project-picker";
import { InvoicePdfViewer } from "@/components/invoices/invoice-pdf-viewer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { useBillingSettingsQuery } from "@/hooks/use-billing-settings";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePdfDocument } from "@/hooks/use-pdf-document";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { useCreateInvoice, useUpdateInvoice, type InvoiceFormValues } from "@/hooks/use-invoices";
import { invoiceStatusLabels } from "@/lib/labels";
import type { InvoiceRecord, InvoiceStatus } from "@/lib/types";

const statuses = Object.keys(invoiceStatusLabels) as InvoiceStatus[];

const lineSchema = z.object({
  description: z.string().min(1, "Description requise."),
  quantity: z.number().min(0.001, "Quantité invalide."),
  unitPrice: z.number().min(0, "Prix invalide."),
  taxRatePercent: z.number().min(0, "Taux invalide."),
});

const formSchema = z.object({
  clientId: z.string().min(1, "Le client est requis."),
  projectId: z.string().optional().or(z.literal("")),
  status: z.custom<InvoiceStatus>((v) => typeof v === "string" && statuses.includes(v as InvoiceStatus)),
  issueDate: z.string().min(1, "Date requise."),
  dueDate: z.string().min(1, "Date requise."),
  currency: z.string().min(1, "Devise requise."),
  notes: z.string().optional().or(z.literal("")),
  lines: z.array(lineSchema).min(1, "Ajoutez au moins une ligne."),
});

type FormValues = z.infer<typeof formSchema>;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** The company's own payment terms decide the due date, not a hard-coded fortnight. */
function dueInIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function toFormValues(
  invoice?: InvoiceRecord,
  defaultClientId?: string,
  termsDays = 30,
  taxRate = 0,
): FormValues {
  return {
    clientId: invoice?.clientId ?? defaultClientId ?? "",
    projectId: invoice?.projectId ?? "",
    status: invoice?.status ?? "Brouillon",
    issueDate: invoice?.issueDate ?? todayIso(),
    dueDate: invoice?.dueDate ?? dueInIso(termsDays),
    currency: invoice?.currency ?? "CAD",
    notes: invoice?.notes ?? "",
    lines: invoice?.lines?.length
      ? invoice.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxRatePercent: l.taxRatePercent,
        }))
      // The first line gets the company's rates like any other. Zero is not a neutral
      // default on an invoice — it is a claim that nothing is taxable.
      : [{ description: "", quantity: 1, unitPrice: 0, taxRatePercent: taxRate }],
  };
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency }).format(amount);
}

export function InvoiceForm({ invoice, defaultClientId }: { invoice?: InvoiceRecord; defaultClientId?: string }) {
  const router = useRouter();
  const isEditing = Boolean(invoice);
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();

  const { data: settings, isLoading: settingsLoading } = useBillingSettingsQuery();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(invoice, defaultClientId),
  });

  useEffect(() => {
    form.reset(
      toFormValues(
        invoice,
        defaultClientId,
        settings?.paymentTermsDays,
        (settings?.gstRate ?? 0) + (settings?.qstRate ?? 0),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id, settings?.paymentTermsDays, settings?.gstRate, settings?.qstRate]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const clientId = useWatch({ control: form.control, name: "clientId" });
  const projectId = useWatch({ control: form.control, name: "projectId" });
  const currency = useWatch({ control: form.control, name: "currency" }) || "CAD";
  const lines = useWatch({ control: form.control, name: "lines" });
  const issueDate = useWatch({ control: form.control, name: "issueDate" });
  const dueDate = useWatch({ control: form.control, name: "dueDate" });
  const notes = useWatch({ control: form.control, name: "notes" });
  const status = useWatch({ control: form.control, name: "status" });

  // The document is built by the API from what is on screen, so the preview is the invoice
  // rather than a second drawing of it. Debounced: it is a round trip, and one per keystroke
  // would be a request the person has already made obsolete by the time it answers.
  const draft = useMemo(
    () =>
      JSON.stringify({
        clientId,
        projectId: projectId || null,
        status,
        issueDate,
        dueDate,
        currency,
        notes: notes || null,
        lines: (lines ?? []).map((line) => ({
          description: line.description ?? "",
          quantity: Number(line.quantity) || 0,
          unitPrice: Number(line.unitPrice) || 0,
          taxRatePercent: Number(line.taxRatePercent) || 0,
        })),
      }),
    [clientId, projectId, status, issueDate, dueDate, currency, notes, lines],
  );

  const debouncedDraft = useDebouncedValue(draft, 500);

  // Nothing to draw without a client and dates: the request would be refused rather than
  // return a document with holes in it.
  const preview = usePdfDocument(
    clientId && issueDate && dueDate
      // An invoice being edited is previewed under its own number, not under the one the next
      // invoice will get.
      ? `invoices/preview${invoice ? `?invoiceId=${invoice.id}` : ""}`
      : null,
    debouncedDraft,
  );

  // A new line carries the company's own rates. Zero is not a neutral default on an invoice —
  // it is a claim that nothing is taxable, and it would be wrong on nearly every line.
  const defaultTaxRate = (settings?.gstRate ?? 0) + (settings?.qstRate ?? 0);

  const subtotal = lines?.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0) ?? 0;
  const taxTotal =
    lines?.reduce(
      (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * ((Number(l.taxRatePercent) || 0) / 100),
      0,
    ) ?? 0;

  async function onSubmit(values: FormValues) {
    const payload: InvoiceFormValues = {
      clientId: values.clientId,
      projectId: values.projectId || null,
      status: values.status,
      issueDate: values.issueDate,
      dueDate: values.dueDate,
      currency: values.currency,
      notes: values.notes || undefined,
      lines: values.lines,
    };

    try {
      if (isEditing && invoice) {
        await updateInvoice.mutateAsync({ id: invoice.id, values: payload });
        toast.success("Facture mise à jour.");
      } else {
        await createInvoice.mutateAsync(payload);
        toast.success("Facture créée.");
      }
      router.push("/factures");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer la facture.");
    }
  }

  const pending = createInvoice.isPending || updateInvoice.isPending;

  // Only on the way in. An invoice that already exists can still be corrected — locking someone
  // out of fixing a typo because a settings page is blank would be punishing the wrong thing.
  if (!isEditing && !settingsLoading && settings && !settings.configured) {
    return (
      <Alert className="max-w-xl">
        <AlertTitle>Paramètres de facturation à remplir</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            Vos taxes, votre numérotation et vos conditions de paiement apparaissent sur chaque
            facture. Réglez-les une fois, puis revenez ici.
          </p>
          <Link href="/parametres" className={cn(buttonVariants({ size: "sm" }))}>
            Aller aux paramètres
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_30rem]">
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informations générales</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="clientId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="invoice-client">Client</FieldLabel>
                    <ClientPicker
                      id="invoice-client"
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v);
                        // The project belonged to the client being replaced.
                        form.setValue("projectId", "");
                      }}
                      invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />

              <Controller
                name="projectId"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="invoice-project">Projet (optionnel)</FieldLabel>
                    <ProjectPicker id="invoice-project" clientId={clientId} value={field.value ?? ""} onChange={field.onChange} />
                  </Field>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Controller
                name="status"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="invoice-status">Statut</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="invoice-status" className="w-full">
                        <SelectValue>{(s: InvoiceStatus) => invoiceStatusLabels[s]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((status) => (
                          <SelectItem key={status} value={status}>
                            {invoiceStatusLabels[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />

              <Controller
                name="issueDate"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="invoice-issue">Date d&apos;émission</FieldLabel>
                    <Input {...field} id="invoice-issue" type="date" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />

              <Controller
                name="dueDate"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="invoice-due">Date d&apos;échéance</FieldLabel>
                    <Input {...field} id="invoice-due" type="date" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="currency"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="invoice-currency">Devise</FieldLabel>
                    <Input {...field} id="invoice-currency" className="uppercase" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            <Controller
              name="notes"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="invoice-notes">Notes</FieldLabel>
                  <Textarea {...field} id="invoice-notes" rows={2} />
                </Field>
              )}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Lignes de facturation</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ description: "", quantity: 1, unitPrice: 0, taxRatePercent: defaultTaxRate })}
          >
            <Plus />
            Ajouter une ligne
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {form.formState.errors.lines?.message && (
            <p className="text-sm font-medium text-destructive">{form.formState.errors.lines.message}</p>
          )}

          <div className="space-y-3">
            {fields.map((lineField, index) => (
              <div key={lineField.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-start">
                <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_90px_110px_90px]">
                  <Controller
                    name={`lines.${index}.description`}
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel className="sr-only">Description</FieldLabel>
                        <Input {...field} placeholder="Description" aria-invalid={fieldState.invalid} />
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )}
                  />
                  <Controller
                    name={`lines.${index}.quantity`}
                    control={form.control}
                    render={({ field }) => (
                      <Field>
                        <FieldLabel className="sr-only">Quantité</FieldLabel>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Qté"
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                        />
                      </Field>
                    )}
                  />
                  <Controller
                    name={`lines.${index}.unitPrice`}
                    control={form.control}
                    render={({ field }) => (
                      <Field>
                        <FieldLabel className="sr-only">Prix unitaire</FieldLabel>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Prix"
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                        />
                      </Field>
                    )}
                  />
                  <Controller
                    name={`lines.${index}.taxRatePercent`}
                    control={form.control}
                    render={({ field }) => (
                      <Field>
                        <FieldLabel className="sr-only">Taxe %</FieldLabel>
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          placeholder="Taxe %"
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                        />
                      </Field>
                    )}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Retirer la ligne"
                  disabled={fields.length === 1}
                  onClick={() => remove(index)}
                  className="shrink-0 self-center"
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>

          <div className="ml-auto w-full max-w-xs space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Sous-total</span>
              <span>{formatCurrency(subtotal, currency)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Taxes</span>
              <span>{formatCurrency(taxTotal, currency)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold text-foreground">
              <span>Total</span>
              <span>{formatCurrency(subtotal + taxTotal, currency)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/factures")}>
          Annuler
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {isEditing ? "Enregistrer la facture" : "Créer la facture"}
        </Button>
      </div>
    </form>

      {/* Beside the form on a wide screen, under it otherwise — stacking beats a preview too
          narrow to read. Sticky so it stays in view while the lines are being filled in. */}
      <aside className="xl:sticky xl:top-6 xl:self-start">
        <InvoicePdfViewer
          url={preview.url}
          loading={preview.loading}
          error={clientId ? preview.error : "Choisissez un client pour voir la facture."}
          title={`Facture ${invoice?.number ?? settings?.nextInvoiceLabel ?? ""}`.trim()}
          fileName={`Facture-${invoice?.number ?? settings?.nextInvoiceLabel ?? "brouillon"}.pdf`}
        />
      </aside>
    </div>
  );
}
