"use client";

import { useEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { dayIso, todayIso } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { AddressPicker } from "@/components/addresses/address-picker";
import { ClientAssetPicker } from "@/components/assets/client-asset-picker";
import { ClientPicker } from "@/components/clients/client-picker";
import { ClientQuickView } from "@/components/clients/client-quick-view";
import { ContactPicker } from "@/components/clients/contact-picker";
import { ProjectCategoryFields } from "@/components/projects/project-category-fields";
import { useClientContactsQuery, useClientQuery } from "@/hooks/use-clients";
import { useCreateQuote, useQuoteTemplatesQuery, useUpdateQuote } from "@/hooks/use-quotes";
import { useWageClassificationsQuery } from "@/hooks/use-wage-classifications";
import { quoteStatusLabels } from "@/lib/labels";
import { ex } from "@/lib/placeholders";
import {
  formatQuoteNumber,
  type QuoteFormValues,
  type QuoteRecord,
  type QuoteStatus,
} from "@/lib/types";

const allStatuses = Object.keys(quoteStatusLabels) as QuoteStatus[];
/** Accepted is reached by converting to a project, never from the dropdown. */
// Replaced comes from revising and is never picked by hand. Accepted is: the client said yes
// by phone, and the quote has to be approved before it becomes a project.
const pickableStatuses = allStatuses.filter((status) => status !== "Remplacee");

const NO_CLASSIFICATION = "aucun";

/** A month: how long a price is usually held in the trades. */
const DEFAULT_VALIDITY_IN_DAYS = 30;

const formSchema = z
  .object({
    clientId: z.string().min(1, "Le client est requis."),
    poNumber: z.string().trim().max(60, "60 caractères maximum."),
    description: z.string(),
    status: z.custom<QuoteStatus>((v) => typeof v === "string" && allStatuses.includes(v as QuoteStatus)),
    issuedOn: z.string(),
    validUntil: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    isTaxExempt: z.boolean(),
    clientAddressId: z.string(),
    sameAddressAsClient: z.boolean(),
    siteAddressId: z.string(),
    clientAssetId: z.string(),
    categoryId: z.string(),
    subCategoryId: z.string(),
    wageClassificationId: z.string(),
    depositPercent: z
      .string()
      .refine((v) => v.trim() === "" || (Number(v) >= 0 && Number(v) <= 100), "Un pourcentage entre 0 et 100."),
    templateId: z.string(),
    contactId: z.string(),
    billingContactId: z.string(),
  })
  .refine((v) => !v.issuedOn || !v.validUntil || v.validUntil >= v.issuedOn, {
    path: ["validUntil"],
    message: "L'échéance précède la date de la soumission.",
  });

type FormValues = z.infer<typeof formSchema>;

function toFormValues(quote?: QuoteRecord, defaultClientId?: string, defaultTemplateId?: string): FormValues {
  return {
    clientId: quote?.clientId ?? defaultClientId ?? "",
    poNumber: quote?.poNumber ?? "",
    description: quote?.description ?? "",
    status: quote?.status ?? "Brouillon",
    // A new quote is dated today and holds for a month; an existing one keeps what it had,
    // blank included.
    issuedOn: quote ? (quote.issuedOn ?? "") : todayIso(),
    validUntil: quote ? (quote.validUntil ?? "") : dayIso(DEFAULT_VALIDITY_IN_DAYS),
    startDate: quote?.startDate ?? "",
    endDate: quote?.endDate ?? "",
    isTaxExempt: quote?.isTaxExempt ?? false,
    clientAddressId: quote?.clientAddress?.id ?? "",
    sameAddressAsClient: quote?.sameAddressAsClient ?? true,
    siteAddressId: quote?.siteAddress?.id ?? "",
    clientAssetId: quote?.clientAssetId ?? "",
    categoryId: quote?.categoryId ?? "",
    subCategoryId: quote?.subCategoryId ?? "",
    wageClassificationId: quote?.wageClassificationId ?? "",
    depositPercent: quote?.depositPercent != null ? String(quote.depositPercent) : "",
    templateId: quote ? "" : (defaultTemplateId ?? ""),
    contactId: quote?.contactId ?? "",
    billingContactId: quote?.billingContactId ?? "",
  };
}

/**
 * Creates or edits a quote. The same fields as a project, because an accepted quote becomes
 * one and nothing typed here should have to be typed again — plus the two dates a price has:
 * when it was given and until when it holds.
 */
export function QuoteFormSheet({
  open,
  onOpenChange,
  quote,
  defaultClientId,
  defaultTemplateId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote?: QuoteRecord;
  defaultClientId?: string;
  /** Opened from « Utiliser ce modèle »: the template is picked, the client is what is left. */
  defaultTemplateId?: string;
  onCreated?: (quote: QuoteRecord) => void;
}) {
  const isEditing = Boolean(quote);
  const create = useCreateQuote();
  // Only when creating: an existing quote already has its lines.
  const { data: templates } = useQuoteTemplatesQuery(open && !isEditing);
  const update = useUpdateQuote();
  const pending = create.isPending || update.isPending;
  // Once it is a project, the price belongs to the project: client, tax and status stay put.
  const converted = Boolean(quote?.projectId);
  const [exemptTouched, setExemptTouched] = useState(false);
  const [viewingClient, setViewingClient] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(quote, defaultClientId, defaultTemplateId),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(quote, defaultClientId, defaultTemplateId));
  }, [open, quote, defaultClientId, defaultTemplateId, form]);

  const clientId = useWatch({ control: form.control, name: "clientId" });
  const sameAddress = useWatch({ control: form.control, name: "sameAddressAsClient" });
  const categoryId = useWatch({ control: form.control, name: "categoryId" });
  const subCategoryId = useWatch({ control: form.control, name: "subCategoryId" });
  const { data: classifications, isLoading: classificationsLoading } = useWageClassificationsQuery();

  const { data: clientRecord } = useClientQuery(clientId || undefined);
  const { data: clientContacts } = useClientContactsQuery(clientId);
  const pickedClient = isEditing ? undefined : clientRecord;
  useEffect(() => {
    if (isEditing || exemptTouched || !pickedClient) return;
    form.setValue("isTaxExempt", pickedClient.isTaxExempt);
  }, [isEditing, exemptTouched, pickedClient, form]);

  // The client whose contacts and address were last filled in; an existing quote starts filled.
  const filledFor = useRef<string | null>(quote?.clientId ?? null);

  /**
   * Picking a client fills in who and where from their file: their first contact, their billing
   * contact, their main address. Only empty fields, once per client.
   */
  useEffect(() => {
    if (!open || !clientId || filledFor.current === clientId) return;
    if (!clientRecord || clientRecord.id !== clientId || !clientContacts) return;
    filledFor.current = clientId;

    const first = clientContacts[0]?.id ?? "";
    const billing = clientContacts.some((c) => c.id === clientRecord.billingContactId)
      ? (clientRecord.billingContactId ?? "")
      : first;
    if (!form.getValues("contactId")) form.setValue("contactId", first);
    if (!form.getValues("billingContactId")) form.setValue("billingContactId", billing);
    if (!form.getValues("clientAddressId") && clientRecord.primaryAddress?.id) {
      form.setValue("clientAddressId", clientRecord.primaryAddress.id);
    }
  }, [open, clientId, clientRecord, clientContacts, form]);

  async function onSubmit(values: FormValues) {
    const payload: QuoteFormValues = {
      clientId: values.clientId,
      poNumber: values.poNumber.trim() || null,
      description: values.description || null,
      status: values.status,
      issuedOn: values.issuedOn || null,
      validUntil: values.validUntil || null,
      startDate: values.startDate || null,
      endDate: values.endDate || null,
      isTaxExempt: values.isTaxExempt,
      clientAddressId: values.clientAddressId || null,
      sameAddressAsClient: values.sameAddressAsClient,
      siteAddressId: values.sameAddressAsClient ? null : values.siteAddressId || null,
      clientAssetId: values.clientAssetId || null,
      categoryId: values.categoryId || null,
      subCategoryId: values.categoryId ? values.subCategoryId || null : null,
      wageClassificationId: values.wageClassificationId || null,
      depositPercent: values.depositPercent.trim() ? Number(values.depositPercent) : null,
      templateId: isEditing ? null : values.templateId || null,
      contactId: values.contactId || null,
      billingContactId: values.billingContactId || null,
    };

    try {
      if (isEditing && quote) {
        await update.mutateAsync({ id: quote.id, values: payload });
        toast.success("Soumission mise à jour.");
      } else {
        const created = await create.mutateAsync(payload);
        toast.success(`Soumission ${formatQuoteNumber(created.number, created.revision)} créée.`);
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer la soumission.");
    }
  }

  // Accepted is offered once the quote can have been answered: never on a draft nobody received.
  const statuses = converted
    ? allStatuses
    : pickableStatuses.filter((status) => status !== "Acceptee" || quote?.status !== "Brouillon");

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setExemptTouched(false);
          filledFor.current = quote?.clientId ?? null;
        }
        onOpenChange(next);
      }}
    >
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier la soumission" : "Nouvelle soumission"}</SheetTitle>
          <SheetDescription>
            {isEditing && quote
              ? `Numéro ${formatQuoteNumber(quote.number, quote.revision)} — attribué automatiquement et jamais réutilisé.`
              : "Le numéro est attribué automatiquement à la création."}
          </SheetDescription>
        </SheetHeader>

        <form
          id="quote-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={(event) => {
            // Stops here: a sheet opened from inside another form would otherwise submit it too.
            event.stopPropagation();
            return form.handleSubmit(onSubmit)(event);
          }}
          noValidate
        >
          <FieldGroup>
            <fieldset disabled={converted} className="contents">
              <Controller
                name="clientId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel htmlFor="quote-client">
                        Client
                        <RequiredMark />
                      </FieldLabel>
                      {field.value && (
                        <Button type="button" variant="ghost" size="xs" onClick={() => setViewingClient(true)}>
                          <UserRound />
                          Fiche du client
                        </Button>
                      )}
                    </div>
                    <ClientPicker
                      id="quote-client"
                      value={field.value}
                      onChange={(next) => {
                        field.onChange(next);
                        // The addresses and the asset belonged to the client being replaced.
                        form.setValue("clientAddressId", "");
                        form.setValue("siteAddressId", "");
                        form.setValue("clientAssetId", "");
                        form.setValue("contactId", "");
                        form.setValue("billingContactId", "");
                      }}
                      invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </fieldset>

            <Controller
              name="contactId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="quote-contact">Contact principal</FieldLabel>
                  <ContactPicker id="quote-contact" clientId={clientId} value={field.value} onChange={field.onChange} />
                </Field>
              )}
            />

            <Controller
              name="billingContactId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="quote-billing-contact">Contact de facturation</FieldLabel>
                  <ContactPicker
                    id="quote-billing-contact"
                    clientId={clientId}
                    value={field.value}
                    onChange={field.onChange}
                  />
                </Field>
              )}
            />

            <Controller
              name="clientAddressId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="quote-client-address">Adresse du client</FieldLabel>
                  <AddressPicker
                    id="quote-client-address"
                    clientId={clientId}
                    value={field.value}
                    onChange={field.onChange}
                  />
                </Field>
              )}
            />

            <Controller
              name="sameAddressAsClient"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id="quote-same-address"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <FieldLabel htmlFor="quote-same-address" className="font-normal">
                    Les travaux ont lieu à cette adresse
                  </FieldLabel>
                </Field>
              )}
            />

            {!sameAddress && (
              <Controller
                name="siteAddressId"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="quote-site-address">Adresse des travaux</FieldLabel>
                    <AddressPicker
                      id="quote-site-address"
                      clientId={clientId}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Rechercher le lieu des travaux…"
                    />
                  </Field>
                )}
              />
            )}

            {!isEditing && templates && templates.length > 0 && (
              <Controller
                name="templateId"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="quote-template">Partir d&apos;un modèle</FieldLabel>
                    <Select
                      value={field.value || "aucun"}
                      onValueChange={(value) => field.onChange(value === "aucun" ? "" : (value ?? ""))}
                    >
                      <SelectTrigger id="quote-template" className="w-full">
                        <SelectValue>
                          {(value: string) =>
                            value === "aucun" ? "Aucun, une soumission vide" : (templates.find((t) => t.id === value)?.name ?? "")
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="aucun">Aucun, une soumission vide</SelectItem>
                        {templates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      Ses lignes sont copiées dans la nouvelle soumission, avec sa description et son
                      acompte si vous les laissez vides.
                    </FieldDescription>
                  </Field>
                )}
              />
            )}

            <Controller
              name="description"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="quote-description">Description</FieldLabel>
                  <Textarea {...field} id="quote-description" rows={3} />
                </Field>
              )}
            />

            {/* A new quote is a draft: the status is set by sending it, or by the client's answer. */}
            {isEditing && (
            <Controller
              name="status"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="quote-status">Statut</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={converted}>
                    <SelectTrigger id="quote-status" className="w-full">
                      <SelectValue>{(status: QuoteStatus) => quoteStatusLabels[status]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map((status) => (
                        <SelectItem key={status} value={status}>
                          {quoteStatusLabels[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {converted
                      ? "Acceptée : elle est devenue un projet."
                      : "« Acceptée » quand le client a dit oui : elle peut alors devenir un projet."}
                  </FieldDescription>
                </Field>
              )}
            />
            )}

            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="issuedOn"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="quote-issued">Date</FieldLabel>
                    <Input {...field} id="quote-issued" type="date" />
                  </Field>
                )}
              />
              <Controller
                name="validUntil"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="quote-valid">Valide jusqu&apos;au</FieldLabel>
                    <Input {...field} id="quote-valid" type="date" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            <ProjectCategoryFields
              categoryId={categoryId}
              subCategoryId={subCategoryId}
              onCategoryChange={(id) => form.setValue("categoryId", id, { shouldDirty: true })}
              onSubCategoryChange={(id) => form.setValue("subCategoryId", id, { shouldDirty: true })}
            />

            <Controller
              name="wageClassificationId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="quote-classification">Classement</FieldLabel>
                  <Select
                    value={field.value || null}
                    onValueChange={(value: string | null) =>
                      field.onChange(!value || value === NO_CLASSIFICATION ? "" : value)
                    }
                  >
                    <SelectTrigger id="quote-classification" className="w-full">
                      <SelectValue>
                        {(value: string) =>
                          !value
                            ? classificationsLoading
                              ? "Chargement…"
                              : "Aucun classement"
                            : (classifications?.find((item) => item.id === value)?.name ?? "Chargement…")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CLASSIFICATION}>Aucun classement</SelectItem>
                      {(classifications ?? []).map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />

            <Controller
              name="clientAssetId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="quote-asset">Actif</FieldLabel>
                  <ClientAssetPicker
                    id="quote-asset"
                    clientId={clientId}
                    value={field.value}
                    onChange={field.onChange}
                  />
                </Field>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="startDate"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="quote-start">Début prévu</FieldLabel>
                    <Input {...field} id="quote-start" type="date" />
                  </Field>
                )}
              />
              <Controller
                name="endDate"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="quote-end">Fin prévue</FieldLabel>
                    <Input {...field} id="quote-end" type="date" />
                  </Field>
                )}
              />
            </div>

            <Controller
              name="poNumber"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="quote-po">Numéro de PO</FieldLabel>
                  <Input {...field} id="quote-po" placeholder={ex("PO-4471")} aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="depositPercent"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="quote-deposit">Acompte (%)</FieldLabel>
                  <Input
                    {...field}
                    id="quote-deposit"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="any"
                    disabled={converted}
                    placeholder={ex("30")}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>
                    Facultatif. À l&apos;acceptation, une facture d&apos;acompte est préparée en
                    brouillon pour que vous la vérifiiez et l&apos;envoyiez.
                  </FieldDescription>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
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
                      id="quote-tax-exempt"
                      checked={field.value}
                      disabled={converted}
                      onCheckedChange={(checked) => {
                        setExemptTouched(true);
                        field.onChange(checked === true);
                      }}
                    />
                    <FieldLabel htmlFor="quote-tax-exempt" className="font-normal">
                      Soumission non taxable
                    </FieldLabel>
                  </div>
                  {!isEditing && pickedClient?.isTaxExempt && !exemptTouched && (
                    <FieldDescription>Coché parce que {pickedClient.name} est non taxable.</FieldDescription>
                  )}
                </Field>
              )}
            />

          </FieldGroup>
        </form>

        <ClientQuickView clientId={clientId} open={viewingClient} onOpenChange={setViewingClient} />

        <SheetFooter>
          <Button type="submit" form="quote-form" disabled={pending}>
            {pending && <Spinner />}
            {isEditing ? "Enregistrer" : "Créer la soumission"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
