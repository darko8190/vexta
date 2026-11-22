"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
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
import { ClientPicker } from "@/components/clients/client-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldDescription } from "@/components/ui/field";
import { useClientQuery } from "@/hooks/use-clients";
import { useCreateProject, useUpdateProject, type ProjectFormValues } from "@/hooks/use-projects";
import { projectStatusLabels } from "@/lib/labels";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatProjectNumber, type PricePolicy, type ProjectRecord, type ProjectStatus } from "@/lib/types";

const statuses = Object.keys(projectStatusLabels) as ProjectStatus[];

/** Base UI needs a value for every item, and "" is not one. */
const NO_POLICY = "aucune";

const formSchema = z.object({
  clientId: z.string().min(1, "Le client est requis."),
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
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(project?: ProjectRecord, defaultClientId?: string): FormValues {
  return {
    clientId: project?.clientId ?? defaultClientId ?? "",
    poNumber: project?.poNumber ?? "",
    clientAddressId: project?.clientAddress?.id ?? "",
    // A new project bills and works at the same place until someone says otherwise, which is
    // the common case and saves picking the same address twice.
    sameAddressAsClient: project?.sameAddressAsClient ?? true,
    siteAddressId: project?.siteAddress?.id ?? "",
    description: project?.description ?? "",
    status: project?.status ?? "AFaire",
    startDate: project?.startDate ?? "",
    endDate: project?.endDate ?? "",
    budget: project?.budget != null ? String(project.budget) : "",
    isTaxExempt: project?.isTaxExempt ?? false,
    pricePolicyId: project?.pricePolicyId ?? "",
  };
}

/**
 * The project exactly as it is stored, in the shape the save endpoint wants.
 *
 * Used to reopen a billed job: the API refuses an edit that touches anything but the status, so
 * reopening has to send back every other field unchanged rather than whatever happens to be in
 * the form at that moment.
 */
function storedValues(project: ProjectRecord): ProjectFormValues {
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
  };
}

export function ProjectFormSheet({
  open,
  onOpenChange,
  project,
  defaultClientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: ProjectRecord;
  defaultClientId?: string;
}) {
  const isEditing = Boolean(project);
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();

  // Set as soon as the box is touched, which is what stops the client's answer below from
  // overwriting a decision someone has just made about this job.
  const [exemptTouched, setExemptTouched] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(project, defaultClientId),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(project, defaultClientId));
  }, [open, project, defaultClientId, form]);

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
    };

    try {
      if (isEditing && project) {
        await updateProject.mutateAsync({ id: project.id, values: payload });
        toast.success("Projet mis à jour.");
      } else {
        await createProject.mutateAsync(payload);
        toast.success("Projet créé.");
      }
      onOpenChange(false);
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

  // Shares its cache with the settings screen that manages them; this form only reads.
  const { data: policies } = useQuery({
    queryKey: ["price-policies"],
    queryFn: () => api.get<PricePolicy[]>("price-policies"),
  });

  // Only while creating: an existing project owns its own answer, and re-reading the client's
  // would quietly change the tax on a job that has already been invoiced.
  const { data: pickedClient } = useClientQuery(isEditing ? undefined : clientId || undefined);

  useEffect(() => {
    if (isEditing || exemptTouched || !pickedClient) return;
    form.setValue("isTaxExempt", pickedClient.isTaxExempt);
  }, [isEditing, exemptTouched, pickedClient, form]);

  return (
    <Sheet
      open={open}
      // Cleared as the panel closes rather than as it opens: the same reset, but in an event
      // handler, where the React Compiler lint can see it is not a render-time cascade.
      onOpenChange={(next) => {
        if (!next) setExemptTouched(false);
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
                Ce projet a été facturé : ses matériaux, ses heures et ses dépenses sont les
                chiffres portés sur la facture. Rouvrez-le pour y toucher.
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
          {/* A fieldset rather than a disabled prop on each control: one attribute turns the
              whole card read-only, and nothing can be added later that forgets to follow. */}
          <fieldset disabled={billed} className="min-w-0 border-0 p-0">
          <FieldGroup>
            <Controller
              name="clientId"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="project-client">
                    Client
                    <RequiredMark />
                  </FieldLabel>
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
                    }}
                    invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

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

            <Controller
              name="poNumber"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="project-po">Numéro de PO</FieldLabel>
                  <Input {...field} id="project-po" placeholder="PO-4471" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>Le bon de commande du client, repris sur ses factures.</FieldDescription>
                  )}
                </Field>
              )}
            />

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
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="project-site-address">Adresse du projet</FieldLabel>
                    <AddressPicker
                      id="project-site-address"
                      clientId={clientId}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      placeholder="Rechercher le lieu des travaux…"
                    />
                    <FieldDescription>Où le travail se fait, quand ce n&apos;est pas là où va la facture.</FieldDescription>
                  </Field>
                )}
              />
            )}
          </FieldGroup>
          </fieldset>
        </form>

        <SheetFooter>
          <Button type="submit" form="project-form" disabled={pending || billed}>
            {pending && <Spinner />}
            {isEditing ? "Enregistrer" : "Créer le projet"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
