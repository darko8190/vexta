"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useCreateForm, useUpdateForm } from "@/hooks/use-forms";
import { ApiError } from "@/lib/api";
import { ex } from "@/lib/placeholders";
import { formKindHints, formKindLabels } from "@/lib/labels";
import type { FormKind, FormTemplate } from "@/lib/types";

const kinds = Object.keys(formKindLabels) as FormKind[];

const formSchema = z.object({
  title: z.string().trim().min(1, "Le titre est obligatoire.").max(200, "200 caractères maximum."),
  description: z.string().trim().max(1000, "1000 caractères maximum."),
  successMessage: z.string().trim().max(500, "500 caractères maximum."),
  kind: z.enum(["Defaut", "Actif", "Client", "Soumission"]),
  isPublished: z.boolean(),
  showOnPublicPage: z.boolean(),
  requiresIdentification: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(template?: FormTemplate): FormValues {
  return {
    title: template?.title ?? "",
    description: template?.description ?? "",
    successMessage: template?.successMessage ?? "",
    kind: template?.kind ?? "Defaut",
    isPublished: template?.isPublished ?? false,
    showOnPublicPage: template?.showOnPublicPage ?? false,
    requiresIdentification: template?.requiresIdentification ?? false,
  };
}

/**
 * The form's own card: what it is called, what it is for, and whether it is offered yet.
 *
 * The questions are not here. A twelve-question inspection sheet is built on its own page, and
 * a panel that tried to hold both would be a panel nobody can see the bottom of.
 */
export function FormTemplateSheet({
  open,
  onOpenChange,
  template,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: FormTemplate;
  /** Handed the new form's id, so the caller can open its builder straight away. */
  onCreated?: (id: string) => void;
}) {
  const isEditing = Boolean(template);
  const create = useCreateForm();
  const update = useUpdateForm();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(template),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(template));
  }, [open, template, form]);

  const pending = create.isPending || update.isPending;

  async function onSubmit(values: FormValues) {
    const payload = {
      title: values.title,
      description: values.description || null,
      successMessage: values.successMessage || null,
      kind: values.kind,
      isPublished: values.isPublished,
      showOnPublicPage: values.showOnPublicPage,
      requiresIdentification: values.requiresIdentification,
      sortOrder: 0,
    };

    try {
      if (template) {
        await update.mutateAsync({ id: template.id, values: payload });
        toast.success("Formulaire enregistré.");
      } else {
        // A new form is never published by the API: it has no questions yet, and publishing it
        // would offer a crew an empty form. The next step is the builder.
        const created = await create.mutateAsync(payload);
        toast.success("Formulaire créé. Ajoutez-y vos questions.");
        onCreated?.(created.form.id);
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Impossible d'enregistrer ce formulaire.",
      );
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier le formulaire" : "Nouveau formulaire"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Son titre, sa description et sa publication. Les questions se modifient sur sa page."
              : "Donnez-lui un titre. Vous ajouterez les questions juste après."}
          </SheetDescription>
        </SheetHeader>

        <form
          id="form-template-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="title"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-title">
                    Titre
                    <RequiredMark />
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-title"
                    placeholder={ex("Inspection avant livraison")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="kind"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="form-kind">Type</FieldLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => field.onChange((value ?? "Defaut") as FormKind)}
                  >
                    <SelectTrigger id="form-kind" className="w-full">
                      <SelectValue>{(value: FormKind) => formKindLabels[value]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {kinds.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {formKindLabels[kind]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* The hint changes with the choice rather than listing all four: somebody
                      picking a type wants to know what the one under their cursor does. */}
                  <FieldDescription>{formKindHints[field.value]}</FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-description">Description</FieldLabel>
                  <Textarea
                    {...field}
                    id="form-description"
                    rows={3}
                    placeholder={ex("À remplir par le contremaître avant de quitter le chantier.")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>Lue au-dessus des questions.</FieldDescription>
                  )}
                </Field>
              )}
            />

            <Controller
              name="successMessage"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-success">Message de confirmation</FieldLabel>
                  <Input
                    {...field}
                    id="form-success"
                    placeholder={ex("Merci, le bureau a reçu votre rapport.")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>
                      Dit à la personne qui vient de l&apos;envoyer. Vide, elle verra un simple
                      merci.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />

            {isEditing && (
              <Controller
                name="isPublished"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="form-published"
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                      />
                      <FieldLabel htmlFor="form-published" className="font-normal">
                        Publié
                      </FieldLabel>
                    </div>
                    <FieldDescription>
                      Un formulaire publié peut être rempli par vos employés. Tant qu&apos;il ne
                      l&apos;est pas, vous êtes seul à le voir — le temps de le finir.
                    </FieldDescription>
                  </Field>
                )}
              />
            )}

            {isEditing && (
              <Controller
                name="showOnPublicPage"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="form-public"
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                      />
                      <FieldLabel htmlFor="form-public" className="font-normal">
                        Sur ma page publique
                      </FieldLabel>
                    </div>
                    <FieldDescription>
                      Offert aux visiteurs de votre page, sans compte. Il faut aussi que le
                      formulaire soit publié et que la page affiche les formulaires. Un
                      formulaire qui demande un fichier ne peut pas y aller : un visiteur sans
                      compte n&apos;a nulle part pour téléverser.
                    </FieldDescription>
                  </Field>
                )}
              />
            )}

            <Controller
              name="requiresIdentification"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="form-identified"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                    <FieldLabel htmlFor="form-identified" className="font-normal">
                      Le client doit s&apos;identifier
                    </FieldLabel>
                  </div>
                  <FieldDescription>
                    Sur la page publique, le visiteur se connecte avec son compte Vexta avant
                    d&apos;envoyer. Ce qu&apos;il remplit va dans son dossier client — ouvert pour
                    lui s&apos;il n&apos;en a pas encore. Pour un actif ou une demande de soumission.
                  </FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="form-template-form" disabled={pending}>
            {pending && <Spinner />}
            {isEditing ? "Enregistrer" : "Créer le formulaire"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
