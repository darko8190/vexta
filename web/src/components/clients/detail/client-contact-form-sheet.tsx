"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { useSaveClientContact } from "@/hooks/use-clients";
import { ApiError } from "@/lib/api";
import type { ClientContact } from "@/lib/types";
import { ex } from "@/lib/placeholders";

const formSchema = z.object({
  firstName: z.string().trim().min(1, "Le prénom est requis.").max(100, "100 caractères maximum."),
  lastName: z.string().trim().min(1, "Le nom est requis.").max(100, "100 caractères maximum."),
  role: z.string().trim().max(100, "100 caractères maximum."),
  phone: z.string().trim().max(40, "40 caractères maximum."),
  email: z
    .string()
    .trim()
    .max(256)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "Courriel invalide."),
  notes: z.string().trim().max(1000, "1000 caractères maximum."),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(contact?: ClientContact): FormValues {
  return {
    firstName: contact?.firstName ?? "",
    lastName: contact?.lastName ?? "",
    role: contact?.role ?? "",
    phone: contact?.phone ?? "",
    email: contact?.email ?? "",
    notes: contact?.notes ?? "",
  };
}

export function ClientContactFormSheet({
  clientId,
  open,
  onOpenChange,
  contact,
}: {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: ClientContact;
}) {
  const isEditing = Boolean(contact);
  const save = useSaveClientContact(clientId);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(contact),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(contact));
  }, [open, contact, form]);

  async function onSubmit(values: FormValues) {
    try {
      await save.mutateAsync({
        id: contact?.id,
        values: {
          firstName: values.firstName,
          lastName: values.lastName,
          role: values.role || null,
          email: values.email || null,
          phone: values.phone || null,
          notes: values.notes || null,
        },
      });
      toast.success(isEditing ? "Contact mis à jour." : "Contact ajouté.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer ce contact.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier le contact" : "Nouveau contact"}</SheetTitle>
          <SheetDescription>Une personne à joindre chez ce client.</SheetDescription>
        </SheetHeader>

        <form
          id="client-contact-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="firstName"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="contact-firstname">Prénom</FieldLabel>
                    <Input {...field} id="contact-firstname" placeholder={ex("Jean")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="lastName"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="contact-lastname">Nom</FieldLabel>
                    <Input {...field} id="contact-lastname" placeholder={ex("Lavoie")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            <Controller
              name="role"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="contact-role">Rôle</FieldLabel>
                  <Input {...field} id="contact-role" placeholder={ex("Comptabilité")} aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="phone"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="contact-phone">Téléphone</FieldLabel>
                    <Input {...field} id="contact-phone" type="tel" placeholder={ex("514 555-0188")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="contact-email">Courriel</FieldLabel>
                    <Input {...field} id="contact-email" type="email" placeholder={ex("jean@abc.ca")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            <Controller
              name="notes"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="contact-notes">Notes</FieldLabel>
                  <Textarea {...field} id="contact-notes" rows={3} aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="client-contact-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {isEditing ? "Enregistrer" : "Ajouter le contact"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
