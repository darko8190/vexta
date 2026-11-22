"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldDescription } from "@/components/ui/field";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import Link from "next/link";
import { ClientPicker } from "@/components/clients/client-picker";
import { ProjectPicker } from "@/components/invoices/project-picker";
import { InvoiceLineRows, type LinesForm } from "@/components/invoices/invoice-line-rows";
import { InvoicePdfViewer } from "@/components/invoices/invoice-pdf-viewer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { useBillingSettingsQuery } from "@/hooks/use-billing-settings";
import { useClientQuery } from "@/hooks/use-clients";
import { useProjectQuery } from "@/hooks/use-projects";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePdfDocument } from "@/hooks/use-pdf-document";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { useCreateInvoice, useUpdateInvoice, type InvoiceFormValues } from "@/hooks/use-invoices";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { invoiceStatusLabels } from "@/lib/labels";
import type { InvoiceRecord, InvoiceStatus, PricePolicy } from "@/lib/types";

const statuses = Object.keys(invoiceStatusLabels) as InvoiceStatus[];

/** Base UI needs a value for every item, and "" is not one. */
const NO_POLICY = "aucune";

const lineKinds = ["Materiaux", "MainDOeuvre", "Equipement", "FraisSupplementaires", "Autre"] as const;

const lineSchema = z.object({
  kind: z.enum(lineKinds),
  productId: z.string().nullable(),
  description: z.string().min(1, "Description requise."),
  quantity: z.number().min(0.001, "Quantité invalide."),
  purchasePrice: z.number().min(0, "Prix invalide.").nullable(),
  marginPercent: z.number().nullable(),
  unitPrice: z.number().min(0, "Prix invalide."),
  isTaxable: z.boolean(),
});

const formSchema = z.object({
  clientId: z.string().min(1, "Le client est requis."),
  projectId: z.string().optional().or(z.literal("")),
  status: z.custom<InvoiceStatus>((v) => typeof v === "string" && statuses.includes(v as InvoiceStatus)),
  issueDate: z.string().min(1, "Date requise."),
  dueDate: z.string().min(1, "Date requise."),
  currency: z.string().min(1, "Devise requise."),
  notes: z.string().optional().or(z.literal("")),
  isTaxExempt: z.boolean(),
  pricePolicyId: z.string().optional().or(z.literal("")),
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
  defaultProjectId?: string,
): FormValues {
  return {
    clientId: invoice?.clientId ?? defaultClientId ?? "",
    projectId: invoice?.projectId ?? defaultProjectId ?? "",
    status: invoice?.status ?? "Brouillon",
    issueDate: invoice?.issueDate ?? todayIso(),
    dueDate: invoice?.dueDate ?? dueInIso(termsDays),
    currency: invoice?.currency ?? "CAD",
    notes: invoice?.notes ?? "",
    isTaxExempt: invoice?.isTaxExempt ?? false,
    pricePolicyId: invoice?.pricePolicyId ?? "",
    lines: invoice?.lines?.length
      ? invoice.lines.map((l) => ({
          kind: l.kind,
          productId: l.productId ?? null,
          description: l.description,
          quantity: l.quantity,
          purchasePrice: l.purchasePrice ?? null,
          marginPercent: l.marginPercent ?? null,
          unitPrice: l.unitPrice,
          isTaxable: l.isTaxable,
        }))
      // Taxable by default. Zero is not a neutral starting point on an invoice — it is a
      // claim that nothing on it is taxable, which is wrong on nearly every line.
      : [
          {
            kind: "Materiaux" as const,
            productId: null,
            description: "",
            quantity: 1,
            purchasePrice: null,
            marginPercent: null,
            unitPrice: 0,
            isTaxable: !(invoice?.isTaxExempt ?? false),
          },
        ],
  };
}

/** Each tax is rounded on its own, the way the API stores and the PDF prints them. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** "TPS (5 %)" — the rate is the company's, so it is shown rather than asked for. */
function rateLabel(name: string, rate: number): string {
  return `${name} (${rate.toLocaleString("fr-CA", { maximumFractionDigits: 3 })} %)`;
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency }).format(amount);
}

export function InvoiceForm({
  invoice,
  defaultClientId,
  defaultProjectId,
}: {
  invoice?: InvoiceRecord;
  defaultClientId?: string;
  /** Pre-selected when the invoice is started from a project's own page. */
  defaultProjectId?: string;
}) {
  const router = useRouter();
  const isEditing = Boolean(invoice);
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();

  const { data: settings, isLoading: settingsLoading } = useBillingSettingsQuery();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(invoice, defaultClientId, 30, defaultProjectId),
  });

  useEffect(() => {
    form.reset(toFormValues(invoice, defaultClientId, settings?.paymentTermsDays, defaultProjectId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id, settings?.paymentTermsDays]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const clientId = useWatch({ control: form.control, name: "clientId" });
  const projectId = useWatch({ control: form.control, name: "projectId" });
  const currency = useWatch({ control: form.control, name: "currency" }) || "CAD";
  const lines = useWatch({ control: form.control, name: "lines" });
  const issueDate = useWatch({ control: form.control, name: "issueDate" });
  const dueDate = useWatch({ control: form.control, name: "dueDate" });
  const notes = useWatch({ control: form.control, name: "notes" });
  const status = useWatch({ control: form.control, name: "status" });
  const isTaxExempt = useWatch({ control: form.control, name: "isTaxExempt" });
  const pricePolicyId = useWatch({ control: form.control, name: "pricePolicyId" });

  // Shares its cache with the settings screen that manages them; this form only reads.
  const { data: policies } = useQuery({
    queryKey: ["price-policies"],
    queryFn: () => api.get<PricePolicy[]>("price-policies"),
  });

  // What the chosen policy charges on catalogue lines. Null means "use the product's own".
  const policyMargin =
    policies?.find((policy) => policy.id === pricePolicyId)?.marginPercent ?? null;

  // Set as soon as the box is touched, so the inheritance below stops overriding a decision
  // someone has just made about this invoice.
  const [exemptTouched, setExemptTouched] = useState(false);

  // Only while creating: a saved invoice owns its own answer, and re-reading the project's
  // would change the tax on a document a client may already have paid against.
  const { data: pickedProject } = useProjectQuery(
    !isEditing && projectId ? projectId : undefined,
  );
  const { data: pickedClient } = useClientQuery(
    !isEditing && !projectId && clientId ? clientId : undefined,
  );

  // The project's answer wins over the client's: the exemption belongs to the client, but a
  // particular job can be the exception, and the project is where that was decided.
  const inheritedExemption = projectId ? pickedProject?.isTaxExempt : pickedClient?.isTaxExempt;

  useEffect(() => {
    if (isEditing || exemptTouched || inheritedExemption === undefined) return;
    if (inheritedExemption === form.getValues("isTaxExempt")) return;

    form.setValue("isTaxExempt", inheritedExemption);
    (form.getValues("lines") ?? []).forEach((_, index) => {
      form.setValue(`lines.${index}.isTaxable`, !inheritedExemption);
    });
  }, [isEditing, exemptTouched, inheritedExemption, form]);

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
        isTaxExempt,
        pricePolicyId: pricePolicyId || null,
        lines: (lines ?? []).map((line) => ({
          kind: line.kind,
          productId: line.productId ?? null,
          description: line.description ?? "",
          quantity: Number(line.quantity) || 0,
          purchasePrice: line.purchasePrice ?? null,
          marginPercent: line.marginPercent ?? null,
          unitPrice: Number(line.unitPrice) || 0,
          isTaxable: Boolean(line.isTaxable),
        })),
      }),
    [clientId, projectId, status, issueDate, dueDate, currency, notes, isTaxExempt, pricePolicyId, lines],
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
  const gstRate = settings?.gstRate ?? 0;
  const qstRate = settings?.qstRate ?? 0;
  const combinedRateLabel = `${(gstRate + qstRate).toLocaleString("fr-CA", { maximumFractionDigits: 3 })} %`;

  /** Ticking the box untaxes every line, which is what makes it a decision and not a label. */
  function applyExemption(exempt: boolean) {
    setExemptTouched(true);
    form.setValue("isTaxExempt", exempt);

    (form.getValues("lines") ?? []).forEach((_, index) => {
      form.setValue(`lines.${index}.isTaxable`, !exempt);
    });
  }

  const subtotal = lines?.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0) ?? 0;

  // Only what is taxable carries tax, and an exempt invoice has nothing taxable on it. The
  // same arithmetic the API runs when it saves, so the figures here are the figures stored.
  const taxableBase = isTaxExempt
    ? 0
    : (lines ?? []).reduce(
        (sum, l) => sum + (l.isTaxable ? (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) : 0),
        0,
      );

  const tax1 = round2((taxableBase * gstRate) / 100);
  const tax2 = round2((taxableBase * qstRate) / 100);

  async function onSubmit(values: FormValues) {
    const payload: InvoiceFormValues = {
      clientId: values.clientId,
      projectId: values.projectId || null,
      status: values.status,
      issueDate: values.issueDate,
      dueDate: values.dueDate,
      currency: values.currency,
      notes: values.notes || undefined,
      isTaxExempt: values.isTaxExempt,
      pricePolicyId: values.pricePolicyId || null,
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
                    <FieldLabel htmlFor="invoice-client">
                      Client
                      <RequiredMark />
                    </FieldLabel>
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

            <Controller
              name="pricePolicyId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="invoice-policy">Politique de prix</FieldLabel>
                  <Select
                    value={field.value || null}
                    onValueChange={(value) => field.onChange(value === NO_POLICY ? "" : (value ?? ""))}
                  >
                    <SelectTrigger id="invoice-policy" className="w-full sm:max-w-sm">
                      <SelectValue>
                        {(value: string) =>
                          !value
                            ? "Marge du produit"
                            : (policies?.find((policy) => policy.id === value)?.name ?? "Chargement…")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_POLICY}>Marge du produit</SelectItem>
                      {(policies ?? []).map((policy) => (
                        <SelectItem key={policy.id} value={policy.id}>
                          {policy.name} — {policy.marginPercent} %
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    La marge appliquée aux matériaux et aux équipements pris dans le catalogue.
                  </FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="isTaxExempt"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="invoice-tax-exempt"
                      checked={field.value}
                      onCheckedChange={(checked) => applyExemption(checked === true)}
                    />
                    <FieldLabel htmlFor="invoice-tax-exempt" className="font-normal">
                      Facture non taxable
                    </FieldLabel>
                  </div>
                  <FieldDescription>
                    {field.value
                      ? "Aucune taxe n'est facturée. La facture l'indique sous le total."
                      : "Cochez pour une vente exonérée. Aucune ligne ne sera taxée."}
                  </FieldDescription>
                </Field>
              )}
            />

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
                    <FieldLabel htmlFor="invoice-issue">
                      Date d&apos;émission
                      <RequiredMark />
                    </FieldLabel>
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
                    <FieldLabel htmlFor="invoice-due">
                      Date d&apos;échéance
                      <RequiredMark />
                    </FieldLabel>
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
                    <FieldLabel htmlFor="invoice-currency">
                      Devise
                      <RequiredMark />
                    </FieldLabel>
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
        <CardHeader>
          <CardTitle className="text-base">Lignes de facturation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {form.formState.errors.lines?.message && (
            <p className="text-sm font-medium text-destructive">{form.formState.errors.lines.message}</p>
          )}

          <InvoiceLineRows
            // The rows only touch `lines`; the cast is what keeps them from having to know
            // about the fifteen other fields on this form.
            form={form as unknown as UseFormReturn<LinesForm>}
            fields={fields}
            append={append}
            remove={remove}
            marginMode={settings?.marginMode ?? "Multiplication"}
            policyMarginPercent={policyMargin}
            hourlyRate={settings?.defaultHourlyRate ?? null}
            isTaxExempt={isTaxExempt}
            taxRateLabel={combinedRateLabel}
          />

          <div className="ml-auto w-full max-w-xs space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Sous-total</span>
              <span className="tabular-nums">{formatCurrency(subtotal, currency)}</span>
            </div>
            {isTaxExempt ? (
              <div className="flex justify-between text-muted-foreground">
                <span>Taxes (non taxable)</span>
                <span className="tabular-nums">{formatCurrency(0, currency)}</span>
              </div>
            ) : (
              <>
                {/* Both taxes, always named. A single "taxes" figure is the one thing a
                    supplier gets asked to break down the moment it files a return. */}
                <div className="flex justify-between text-muted-foreground">
                  <span>{rateLabel("TPS", gstRate)}</span>
                  <span className="tabular-nums">{formatCurrency(tax1, currency)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>{rateLabel("TVQ", qstRate)}</span>
                  <span className="tabular-nums">{formatCurrency(tax2, currency)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-base font-semibold text-foreground">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(subtotal + tax1 + tax2, currency)}</span>
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
