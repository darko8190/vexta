"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { LifeBuoy, MoreHorizontal, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { EmployeePicker } from "@/components/team/employee-picker";
import {
  useDeleteEmergencyContact,
  useEmergencyContactsQuery,
  useSaveEmergencyContact,
} from "@/hooks/use-employee-file";
import { ApiError } from "@/lib/api";
import { ex } from "@/lib/placeholders";
import type { EmergencyContact } from "@/lib/types";

const formSchema = z.object({
  employeeId: z.string().min(1, "Choisissez de qui ce contact est le proche."),
  name: z.string().trim().min(1, "Le nom est requis.").max(150, "150 caractères maximum."),
  relationship: z.string().trim().max(60, "60 caractères maximum."),
  phone: z.string().trim().min(1, "Le numéro est requis.").max(40, "40 caractères maximum."),
  altPhone: z.string().trim().max(40, "40 caractères maximum."),
  email: z
    .string()
    .trim()
    .max(256, "256 caractères maximum.")
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "Courriel invalide."),
  note: z.string().trim().max(1000, "1000 caractères maximum."),
  isPrimary: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(contact: EmergencyContact | undefined, employeeId: string | undefined): FormValues {
  return {
    employeeId: contact?.employeeId ?? employeeId ?? "",
    name: contact?.name ?? "",
    relationship: contact?.relationship ?? "",
    phone: contact?.phone ?? "",
    altPhone: contact?.altPhone ?? "",
    email: contact?.email ?? "",
    note: contact?.note ?? "",
    isPrimary: contact?.isPrimary ?? false,
  };
}

function ContactFormSheet({
  open,
  onOpenChange,
  contact,
  employeeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: EmergencyContact;
  employeeId?: string;
}) {
  const isEditing = Boolean(contact);
  const save = useSaveEmergencyContact();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(contact, employeeId),
  });

  async function onSubmit(values: FormValues) {
    try {
      await save.mutateAsync({
        id: contact?.id ?? null,
        values: {
          employeeId: values.employeeId,
          name: values.name,
          relationship: values.relationship || null,
          phone: values.phone,
          altPhone: values.altPhone || null,
          email: values.email || null,
          isPrimary: values.isPrimary,
          note: values.note || null,
        },
      });
      toast.success(isEditing ? "Contact mis à jour." : "Contact ajouté.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer ce contact.");
    }
  }

  const lockedPrimary = isEditing && Boolean(contact?.isPrimary);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier le contact" : "Nouveau contact d'urgence"}</SheetTitle>
          <SheetDescription>
            Qui appeler s&apos;il arrive quelque chose à cette personne sur un chantier.
          </SheetDescription>
        </SheetHeader>

        <form
          id="emergency-contact-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <FieldGroup>
            {!employeeId && (
              <Controller
                name="employeeId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="contact-employee">Employé</FieldLabel>
                    <EmployeePicker
                      id="contact-employee"
                      value={field.value}
                      onChange={field.onChange}
                      invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="contact-name">Nom</FieldLabel>
                    <Input {...field} id="contact-name" placeholder={ex("Julie Tremblay")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="relationship"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="contact-relationship">Lien</FieldLabel>
                    <Input {...field} id="contact-relationship" placeholder={ex("Conjointe")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="phone"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="contact-phone">Téléphone</FieldLabel>
                    <Input {...field} id="contact-phone" type="tel" placeholder={ex("418 555-0100")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="altPhone"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="contact-alt-phone">Autre numéro</FieldLabel>
                    <Input {...field} id="contact-alt-phone" type="tel" placeholder={ex("418 555-0188")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="contact-email">Courriel</FieldLabel>
                  <Input {...field} id="contact-email" type="email" placeholder={ex("julie.tremblay@courriel.ca")} aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="note"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="contact-note">Note</FieldLabel>
                  <Textarea {...field} id="contact-note" rows={3} placeholder={ex("Travaille de nuit, joindre après 15 h.")} aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="isPrimary"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id="contact-primary"
                    checked={field.value}
                    disabled={lockedPrimary}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <FieldLabel htmlFor="contact-primary">Appeler en premier</FieldLabel>
                </Field>
              )}
            />
            <FieldDescription>
              {lockedPrimary
                ? "C'est déjà le premier appelé. Pour changer, cochez cette case sur un autre contact."
                : "Celui qu'on compose avant les autres."}
            </FieldDescription>
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="emergency-contact-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {isEditing ? "Enregistrer" : "Ajouter le contact"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Who to call.
 *
 * The number is a link on purpose: this list is read on a phone, on a site, by somebody whose
 * hands are not steady. Making them copy a number out by hand is the wrong design for the one
 * minute it exists for.
 */
export function EmergencyContactsSection({ employeeId }: { employeeId?: string }) {
  const { data, isLoading, isError, error, refetch } = useEmergencyContactsQuery(employeeId);
  const remove = useDeleteEmergencyContact();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmergencyContact | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<EmergencyContact | undefined>(undefined);

  const formKey = `${editing?.id ?? "nouveau"}-${formOpen}`;

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Contact retiré.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de retirer ce contact.");
    }
  }

  const addButton = (
    <Button onClick={openCreate}>
      <Plus />
      Ajouter un contact
    </Button>
  );

  const items = data ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Contacts d&apos;urgence</h2>
          <p className="text-sm text-muted-foreground">
            Qui appeler quand il arrive quelque chose sur un chantier.
          </p>
        </div>
        {items.length > 0 && addButton}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Contacts indisponibles"
          fallback="Les contacts d'urgence n'ont pas pu être chargés."
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="Aucun contact d'urgence"
          description="C'est la liste qu'on cherche le jour où on n'a pas le temps de la chercher."
          action={addButton}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((contact) => (
            <li
              key={contact.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{contact.name}</span>
                  {contact.relationship && <Badge variant="secondary">{contact.relationship}</Badge>}
                  {contact.isPrimary && <Badge variant="default">Premier appel</Badge>}
                </div>

                {!employeeId && (
                  <p className="mt-0.5 text-sm text-muted-foreground">Pour {contact.employeeName}</p>
                )}

                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 text-foreground hover:underline">
                    <Phone className="size-3.5 shrink-0" />
                    {contact.phone}
                  </a>
                  {contact.altPhone && (
                    <a href={`tel:${contact.altPhone}`} className="text-muted-foreground hover:underline">
                      {contact.altPhone}
                    </a>
                  )}
                </div>

                {contact.note && <p className="mt-1 text-sm text-muted-foreground">{contact.note}</p>}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon" className="shrink-0" aria-label="Actions sur ce contact">
                      <MoreHorizontal />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(contact);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil />
                    Modifier
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(contact)}>
                    <Trash2 />
                    Retirer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <ContactFormSheet
        key={formKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editing}
        employeeId={employeeId}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Retirer ce contact ?"
        description={`${deleteTarget?.name ?? ""} ne sera plus au dossier de cette personne.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
