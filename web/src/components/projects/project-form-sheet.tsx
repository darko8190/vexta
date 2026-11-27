"use client";

import { useEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { dayIso, todayIso } from "@/lib/dates";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { ContactPicker } from "@/components/clients/contact-picker";
import { ClientQuickView } from "@/components/clients/client-quick-view";
import { useProjectTemplatesQuery } from "@/hooks/use-project-templates";
import { ProjectCategoryFields } from "@/components/projects/project-category-fields";
import { useWageClassificationsQuery } from "@/hooks/use-wage-classifications";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldDescription } from "@/components/ui/field";
import { useClientContactsQuery, useClientQuery } from "@/hooks/use-clients";
import { useCreateProject, useUpdateProject, type ProjectFormValues } from "@/hooks/use-projects";
import { projectStatusLabels } from "@/lib/labels";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  formatProjectNumber,
  type PricePolicy,
  type ProjectRecord,
  type ProjectStatus,
  type RecurrenceUnit,
} from "@/lib/types";
import { formatDateOnly } from "@/lib/dates";
import { ex } from "@/lib/placeholders";

const statuses = Object.keys(projectStatusLabels) as ProjectStatus[];

/** Base UI needs a value for every item, and "" is not one. */
const NO_POLICY = "aucune";
const NO_CLASSIFICATION = "aucun";

const RECURRENCE_UNITS: Record<RecurrenceUnit, string> = { Semaine: "semaine(s)", Mois: "mois", Annee: "année(s)" };

const formSchema = z
  .object({
  clientId: z.string().min(1, "Le client est requis."),
  contactId: z.string(),
  billingContactId: z.string(),
  recurring: z.boolean(),
  recurrenceEvery: z.string(),
  recurrenceUnit: z.custom<RecurrenceUnit>((v) => typeof v === "string" && v in RECURRENCE_UNITS),
  recurrenceEndDate: z.string(),
  templateId: z.string(),
  poNumber: z.string().trim().max(60, "60 caractères maximum.").optional().or(z.literal("")),
  clientAddressId: z.string().optional().or(z.literal("")),
  sameAddressAsClient: z.boolean(),
  siteAddressId: z.string().optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
  status: z.custom<ProjectStatus>((v) => typeof v === "string" && statuses.includes(v as ProjectStatus)),
  startDate: z.string().optional().or(z.literal("")),
  endDate: z.string().optional().or(z.literal("")),
  budget: z.string().optional().or(z.literal("")),
  isTaxExempt: z.boolean(),
  pricePolicyId: z.string().optional().or(z.literal("")),
  clientAssetId: z.string().optional().or(z.literal("")),
  categoryId: z.string(),
  subCategoryId: z.string(),
  wageClassificationId: z.string(),
})
  // Work somewhere else than the billing address has to say where: a crew sent to "not
  // there" is a phone call from the truck.
  .refine((v) => v.sameAddressAsClient || Boolean(v.siteAddressId), {
    message: "Indiquez l'adresse du projet, ou cochez que les travaux ont lieu à l'adresse du client.",
    path: ["siteAddressId"],
  })
  .refine((v) => !v.recurring || /^\d+$/.test(v.recurrenceEvery.trim()) && Number(v.recurrenceEvery) >= 1 && Number(v.recurrenceEvery) <= 99, {
    message: "Entre 1 et 99.",
    path: ["recurrenceEvery"],
  });

type FormValues = z.infer<typeof formSchema>;

/** A week. Long enough to be a plausible mandate, short enough that a wrong one gets corrected. */
const DEFAULT_DURATION_IN_DAYS = 7;

function toFormValues(
  project?: ProjectRecord,
  defaultClientId?: string,
  defaultClientAssetId?: string,
): FormValues {
  return {
    clientId: project?.clientId ?? defaultClientId ?? "",
    contactId: project?.contactId ?? "",
    billingContactId: project?.billingContactId ?? "",
    recurring: project?.recurrenceEvery != null,
    recurrenceEvery: String(project?.recurrenceEvery ?? 1),
    recurrenceUnit: project?.recurrenceUnit ?? "Mois",
    recurrenceEndDate: project?.recurrenceEndDate ?? "",
    templateId: "",
    poNumber: project?.poNumber ?? "",
    clientAddressId: project?.clientAddress?.id ?? "",
    // A new project bills and works at the same place until someone says otherwise, which is
    // the common case and saves picking the same address twice.
    sameAddressAsClient: project?.sameAddressAsClient ?? true,
    siteAddressId: project?.siteAddress?.id ?? "",
    description: project?.description ?? "",
    status: project?.status ?? "AFaire",
    // A new job starts today and is pencilled in for a week: whoever opens this form is about
    // to do the work, not to decide when. An existing project keeps what it was given, blank
    // included — filling an empty date on an edit would quietly schedule an old job.
    startDate: project ? (project.startDate ?? "") : todayIso(),
    endDate: project ? (project.endDate ?? "") : dayIso(DEFAULT_DURATION_IN_DAYS),
    budget: project?.budget != null ? String(project.budget) : "",
    isTaxExempt: project?.isTaxExempt ?? false,
    pricePolicyId: project?.pricePolicyId ?? "",
    clientAssetId: project?.clientAssetId ?? defaultClientAssetId ?? "",
    categoryId: project?.categoryId ?? "",
    subCategoryId: project?.subCategoryId ?? "",
    wageClassificationId: project?.wageClassificationId ?? "",
  };
}

/**
 * The project exactly as it is stored, in the shape the save endpoint wants.
 *
 * Used to reopen a billed job: the API refuses an edit that touches anything but the status, so
 * reopening has to send back every other field unchanged rather than whatever happens to be in
 * the form at that moment.
 */
export function storedValues(project: ProjectRecord): ProjectFormValues {
  return {
    clientId: project.clientId,
    poNumber: project.poNumber,
    clientAddressId: project.clientAddress?.id ?? null,
    sameAddressAsClient: project.sameAddressAsClient,
    siteAddressId: project.siteAddress?.id ?? null,
    description: project.description ?? undefined,
    status: project.status,
    startDate: project.startDate,
    endDate: project.endDate,
    budget: project.budget,
    isTaxExempt: project.isTaxExempt,
    pricePolicyId: project.pricePolicyId,
    clientAssetId: project.clientAssetId,
    categoryId: project.categoryId,
    subCategoryId: project.subCategoryId,
    wageClassificationId: project.wageClassificationId,
    contactId: project.contactId,
    billingContactId: project.billingContactId,
    recurrenceEvery: project.recurrenceEvery,
    recurrenceUnit: project.recurrenceUnit,
    recurrenceEndDate: project.recurrenceEndDate,
  };
}

export function ProjectFormSheet({
  open,
  onOpenChange,
  project,
  defaultClientId,
  defaultClientAssetId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: ProjectRecord;
  defaultClientId?: string;
  /** Opened from an asset's file: the job is on that asset until somebody says otherwise. */
  defaultClientAssetId?: string;
}) {
  const isEditing = Boolean(project);
  const router = useRouter();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();

  // Set as soon as the box is touched, which is what stops the client's answer below from
  // overwriting a decision someone has just made about this job.
  const [exemptTouched, setExemptTouched] = useState(false);
  const [viewingClient, setViewingClient] = useState(false);
  // Only when creating: an existing project already has its lines.
  const { data: templates } = useProjectTemplatesQuery(open && !isEditing);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(project, defaultClientId, defaultClientAssetId),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(project, defaultClientId, defaultClientAssetId));
  }, [open, project, defaultClientId, defaultClientAssetId, form]);

  async function onSubmit(values: FormValues) {
    const payload: ProjectFormValues = {
      clientId: values.clientId,
      poNumber: values.poNumber?.trim() || null,
      clientAddressId: values.clientAddressId || null,
      sameAddressAsClient: values.sameAddressAsClient,
      siteAddressId: values.sameAddressAsClient ? null : values.siteAddressId || null,
      description: values.description || undefined,
      status: values.status,
      startDate: values.startDate || null,
      endDate: values.endDate || null,
      budget: values.budget ? Number(values.budget) : null,
      isTaxExempt: values.isTaxExempt,
      pricePolicyId: values.pricePolicyId || null,
      clientAssetId: values.clientAssetId || null,
      categoryId: values.categoryId || null,
      subCategoryId: values.categoryId ? values.subCategoryId || null : null,
      wageClassificationId: values.wageClassificationId || null,
      contactId: values.contactId || null,
      billingContactId: values.billingContactId || null,
      recurrenceEvery: values.recurring ? Number(values.recurrenceEvery) : null,
      recurrenceUnit: values.recurrenceUnit,
      recurrenceEndDate: values.recurring ? values.recurrenceEndDate || null : null,
      templateId: isEditing ? null : values.templateId || null,
    };

    try {
      if (isEditing && project) {
        await updateProject.mutateAsync({ id: project.id, values: payload });
        toast.success("Projet mis à jour.");
        onOpenChange(false);
      } else {
        const created = await createProject.mutateAsync(payload);
        toast.success("Projet créé.");
        onOpenChange(false);
        // Straight to its page: a new job is created to be worked on, and the next thing
        // anybody does is add its tasks, its hours or its materials.
        router.push(`/projets/${created.id}`);
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer le projet.");
    }
  }

  const pending = createProject.isPending || updateProject.isPending;

  // Billed is a lock, not just a label: the materials, the hours and the expenses behind the
  // job are the figures the client was charged from, and the invoice is the document that will
  // be quoted back at the company. The way out is one deliberate button rather than a status
  // dropdown somebody can nudge by accident.
  const billed = isEditing && project?.status === "Facture";

  async function reopen() {
    if (!project) return;

    try {
      await updateProject.mutateAsync({
        id: project.id,
        values: { ...storedValues(project), status: "AFacturer" },
      });
      toast.success("Projet rouvert. Vous pouvez le modifier.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de rouvrir le projet.");
    }
  }

  // useWatch rather than form.watch: the React Compiler lint refuses a subscription read during
  // render, and the repo already follows this convention elsewhere.
  const clientId = useWatch({ control: form.control, name: "clientId" });
  const sameAddress = useWatch({ control: form.control, name: "sameAddressAsClient" });
  const categoryId = useWatch({ control: form.control, name: "categoryId" });
  const subCategoryId = useWatch({ control: form.control, name: "subCategoryId" });
  const { data: classifications, isLoading: classificationsLoading } = useWageClassificationsQuery();

  // Shares its cache with the settings screen that manages them; this form only reads.
  const { data: policies } = useQuery({
    queryKey: ["price-policies"],
    queryFn: () => api.get<PricePolicy[]>("price-policies"),
  });

  const { data: clientRecord } = useClientQuery(clientId || undefined);
  const { data: clientContacts } = useClientContactsQuery(clientId);
  // Only while creating: an existing project owns its own answer, and re-reading the client's
  // would quietly change the tax on a job that has already been invoiced.
  const pickedClient = isEditing ? undefined : clientRecord;
  const recurring = useWatch({ control: form.control, name: "recurring" });

  useEffect(() => {
    if (isEditing || exemptTouched || !pickedClient) return;
    form.setValue("isTaxExempt", pickedClient.isTaxExempt);
  }, [isEditing, exemptTouched, pickedClient, form]);

  // The client whose contacts and address were last filled in. An edited project starts as
  // already filled: its blanks were left blank by somebody, and are not this form's to fill.
  const filledFor = useRef<string | null>(project?.clientId ?? null);

  /**
   * Picking a client fills in who and where from their file: their first contact for the job,
   * their billing contact (or that same person) for the invoices, their main address. Only
   * into empty fields, and once per client, so nothing a person chose is overwritten.
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

  return (
    <Sheet
      open={open}
      // Cleared as the panel closes rather than as it opens: the same reset, but in an event
      // handler, where the React Compiler lint can see it is not a render-time cascade.
      onOpenChange={(next) => {
        if (!next) {
          setExemptTouched(false);
          filledFor.current = project?.clientId ?? null;
        }
        onOpenChange(next);
      }}
    >
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier le projet" : "Nouveau projet"}</SheetTitle>
          <SheetDescription>
            {isEditing && project
              ? `Numéro ${formatProjectNumber(project.number)} — attribué automatiquement et jamais réutilisé.`
              : "Le numéro est attribué automatiquement à la création."}
          </SheetDescription>
        </SheetHeader>

        {billed && (
          <Alert className="mx-4">
            <AlertTitle>Projet facturé</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                Sa facture est partie : le client, le budget, la politique de prix et la case
                non taxable sont figés, comme ses matériaux, ses heures et ses dépenses. Les
                dates, la description et les adresses restent corrigeables. Rouvrez le projet
                pour toucher aux montants.
              </p>
              <Button type="button" size="sm" variant="outline" onClick={reopen} disabled={pending}>
                {pending && <Spinner />}
                Rouvrir le projet
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <form
          id="project-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <FieldGroup>
            {/* Frozen once the invoice has gone out: these four are what a total is built
                from, and the document the client is holding was built from them. The dates, the
                description and the PO number stay editable — correcting those changes nothing a
                client was charged. */}
            <fieldset disabled={billed} className="contents">
            <Controller
              name="clientId"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel htmlFor="project-client">
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
                    id="project-client"
                    value={field.value}
                    onChange={(next) => {
                      field.onChange(next);
                      // The addresses belonged to the client being replaced. Keeping them would
                      // submit another client's address, which the server refuses — and if it
                      // did not, it would print the wrong street on the invoice.
                      form.setValue("clientAddressId", "");
                      form.setValue("siteAddressId", "");
                      // The contacts too, for the same reason; the new client's are filled in.
                      form.setValue("contactId", "");
                      form.setValue("billingContactId", "");
                      // The asset belonged to the client being replaced. The server refuses
                      // another client's asset, and if it did not, this job would carry
                      // somebody else's truck on its paperwork.
                      form.setValue("clientAssetId", "");
                    }}
                    invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            </fieldset>

            {!isEditing && templates && templates.length > 0 && (
              <Controller
                name="templateId"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="project-template">Partir d&apos;un modèle</FieldLabel>
                    <Select
                      value={field.value || "aucun"}
                      onValueChange={(value) => field.onChange(value === "aucun" ? "" : (value ?? ""))}
                    >
                      <SelectTrigger id="project-template" className="w-full">
                        <SelectValue>
                          {(value: string) =>
                            value === "aucun" ? "Aucun, un projet vide" : (templates.find((t) => t.id === value)?.name ?? "")
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="aucun">Aucun, un projet vide</SelectItem>
                        {templates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      Ses tâches, matériaux, équipements, assemblages et frais sont copiés dans le nouveau projet.
                    </FieldDescription>
                  </Field>
                )}
              />
            )}

            <Controller
              name="contactId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="project-contact">Contact du projet</FieldLabel>
                  <ContactPicker id="project-contact" clientId={clientId} value={field.value} onChange={field.onChange} />
                  <FieldDescription>La personne à joindre pour les travaux.</FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="billingContactId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="project-billing-contact">Contact de facturation</FieldLabel>
                  <ContactPicker
                    id="project-billing-contact"
                    clientId={clientId}
                    value={field.value}
                    onChange={field.onChange}
                  />
                  <FieldDescription>À qui vont les factures de ce projet.</FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="clientAddressId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="project-client-address">Adresse du client</FieldLabel>
                  <AddressPicker
                    id="project-client-address"
                    clientId={clientId}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                  />
                  <FieldDescription>Celle qui apparaît sur la facture.</FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="sameAddressAsClient"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id="project-same-address"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <FieldLabel htmlFor="project-same-address" className="font-normal">
                    Les travaux ont lieu à cette adresse
                  </FieldLabel>
                </Field>
              )}
            />

            {/* Only asked for when it differs. Showing it always would invite the same address
                to be entered twice, and a copy goes stale the moment the client moves. */}
            {!sameAddress && (
              <Controller
                name="siteAddressId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="project-site-address">
                      Adresse du projet
                      <RequiredMark />
                    </FieldLabel>
                    <AddressPicker
                      id="project-site-address"
                      clientId={clientId}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      invalid={fieldState.invalid}
                      placeholder="Rechercher le lieu des travaux…"
                    />
                    {fieldState.invalid ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : (
                      <FieldDescription>Où le travail se fait, quand ce n&apos;est pas là où va la facture.</FieldDescription>
                    )}
                  </Field>
                )}
              />
            )}
            <Controller
              name="description"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="project-description">Description</FieldLabel>
                  <Textarea {...field} id="project-description" rows={3} />
                </Field>
              )}
            />

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
                  <FieldLabel htmlFor="project-classification">Classement</FieldLabel>
                  <Select
                    value={field.value || null}
                    onValueChange={(value: string | null) =>
                      field.onChange(!value || value === NO_CLASSIFICATION ? "" : value)
                    }
                  >
                    <SelectTrigger id="project-classification" className="w-full">
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
                          {item.steps.length > 0 && (
                            <span className="text-muted-foreground">
                              {" "}
                              — {item.steps.length} échelon{item.steps.length > 1 ? "s" : ""}
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {classifications && classifications.length === 0
                      ? "Aucun classement encore : ils se créent dans Paramètres → Taux."
                      : "Les taux du secteur de ce projet. Ils se gèrent dans Paramètres → Taux."}
                  </FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="clientAssetId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="project-asset">Actif</FieldLabel>
                  <ClientAssetPicker
                    id="project-asset"
                    clientId={clientId}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                  />
                  <FieldDescription>
                    Ce sur quoi vous travaillez : le véhicule, le bâtiment, l&apos;appareil. Si
                    le client ne l&apos;a pas encore, ajoutez-le d&apos;ici.
                  </FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="status"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="project-status">Statut</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="project-status" className="w-full">
                      {/* The trigger shows whatever is in the field until the list has been
                          opened once, and what is in the field is the stored name: "EnCours".
                          Formatting it here is what makes the closed select readable. */}
                      <SelectValue>{(status: ProjectStatus) => projectStatusLabels[status]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map((status) => (
                        <SelectItem key={status} value={status}>
                          {projectStatusLabels[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="startDate"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="project-start">Début</FieldLabel>
                    <Input {...field} id="project-start" type="date" />
                  </Field>
                )}
              />
              <Controller
                name="endDate"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="project-end">Fin</FieldLabel>
                    <Input {...field} id="project-end" type="date" />
                  </Field>
                )}
              />
            </div>

            <fieldset disabled={billed} className="contents">
            <Controller
              name="budget"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="project-budget">Budget ($)</FieldLabel>
                  <Input {...field} id="project-budget" type="number" step="0.01" min="0" />
                </Field>
              )}
            />
            </fieldset>

            <Controller
              name="poNumber"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="project-po">Numéro de PO</FieldLabel>
                  <Input {...field} id="project-po" placeholder={ex("PO-4471")} aria-invalid={fieldState.invalid} />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>Le bon de commande du client, repris sur ses factures.</FieldDescription>
                  )}
                </Field>
              )}
            />

            <fieldset disabled={billed} className="contents">
            <Controller
              name="pricePolicyId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="project-policy">Politique de prix</FieldLabel>
                  <Select
                    value={field.value || null}
                    onValueChange={(value) => field.onChange(value === NO_POLICY ? "" : (value ?? ""))}
                  >
                    <SelectTrigger id="project-policy" className="w-full">
                      <SelectValue>
                        {(value: string) =>
                          !value
                            ? "Politique par défaut"
                            : (policies?.find((policy) => policy.id === value)?.name ?? "Chargement…")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_POLICY}>Politique par défaut</SelectItem>
                      {(policies ?? []).map((policy) => (
                        <SelectItem key={policy.id} value={policy.id}>
                          {policy.name} — {policy.marginPercent} %
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    La marge appliquée aux matériaux et aux équipements de ce projet.
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
                      id="project-tax-exempt"
                      checked={field.value}
                      onCheckedChange={(checked) => {
                        setExemptTouched(true);
                        field.onChange(checked === true);
                      }}
                    />
                    <FieldLabel htmlFor="project-tax-exempt" className="font-normal">
                      Projet non taxable
                    </FieldLabel>
                  </div>
                  <FieldDescription>
                    {!isEditing && pickedClient?.isTaxExempt && !exemptTouched
                      ? `Coché parce que ${pickedClient.name} est non taxable.`
                      : "Aucune taxe sur les factures de ce projet."}
                  </FieldDescription>
                </Field>
              )}
            />
            </fieldset>

            <div className="space-y-3 rounded-lg border border-border p-3">
              <Controller
                name="recurring"
                control={form.control}
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Checkbox
                      id="project-recurring"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                    <FieldLabel htmlFor="project-recurring" className="font-normal">
                      Projet récurrent
                    </FieldLabel>
                  </Field>
                )}
              />
              {recurring && (
                <>
                  <div className="grid grid-cols-[5rem_1fr] items-end gap-2">
                    <Controller
                      name="recurrenceEvery"
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="project-recurrence-every">Tous les</FieldLabel>
                          <Input
                            {...field}
                            id="project-recurrence-every"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={99}
                            aria-invalid={fieldState.invalid}
                          />
                        </Field>
                      )}
                    />
                    <Controller
                      name="recurrenceUnit"
                      control={form.control}
                      render={({ field }) => (
                        <Field>
                          <Select value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                            <SelectTrigger aria-label="Unité de la récurrence" className="w-full">
                              <SelectValue>{(unit: RecurrenceUnit) => RECURRENCE_UNITS[unit]}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(RECURRENCE_UNITS) as RecurrenceUnit[]).map((unit) => (
                                <SelectItem key={unit} value={unit}>
                                  {RECURRENCE_UNITS[unit]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      )}
                    />
                  </div>
                  {form.formState.errors.recurrenceEvery && (
                    <FieldError errors={[form.formState.errors.recurrenceEvery]} />
                  )}
                  <Controller
                    name="recurrenceEndDate"
                    control={form.control}
                    render={({ field }) => (
                      <Field>
                        <FieldLabel htmlFor="project-recurrence-end">Jusqu&apos;au</FieldLabel>
                        <Input {...field} id="project-recurrence-end" type="date" />
                        <FieldDescription>
                          Facultatif. À chaque date, une copie du projet et de ses tâches est créée,
                          décalée d&apos;autant à partir du début de celui-ci.
                          {project?.recurrenceEvery != null &&
                            (project.recurrenceNextDate
                              ? ` Prochaine copie : ${formatDateOnly(project.recurrenceNextDate)}.`
                              : " La série est terminée.")}
                        </FieldDescription>
                      </Field>
                    )}
                  />
                </>
              )}
            </div>
          </FieldGroup>
        </form>

        <ClientQuickView clientId={clientId} open={viewingClient} onOpenChange={setViewingClient} />

        <SheetFooter>
          {/* Enabled even on a billed job: the money fields are frozen, the rest is not, and
              a description that cannot be saved is a form that lies about being editable. */}
          <Button type="submit" form="project-form" disabled={pending}>
            {pending && <Spinner />}
            {isEditing ? "Enregistrer" : "Créer le projet"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
