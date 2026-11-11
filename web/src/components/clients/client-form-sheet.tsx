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
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useCreateClient, useUpdateClient, type ClientFormValues } from "@/hooks/use-clients";
import type { ClientRecord } from "@/lib/types";

const formSchema = z.object({
  name: z.string().min(1, "Le nom est requis."),
  email: z.string().email("Courriel invalide.").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  taxId: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(client?: ClientRecord): FormValues {
  return {
    name: client?.name ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    taxId: client?.taxId ?? "",
    notes: client?.notes ?? "",
  };
}

export function ClientFormSheet({
  open,
  onOpenChange,
  client,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: ClientRecord;
}) {
  const isEditing = Boolean(client);
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(client),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(client));
  }, [open, client, form]);

  async function onSubmit(values: FormValues) {
    const payload: ClientFormValues = {
      name: values.name.trim(),
      email: values.email || undefined,
      phone: values.phone || undefined,
      taxId: values.taxId || undefined,
      notes: values.notes || undefined,
    };

    try {
      if (isEditing && client) {
        await updateClient.mutateAsync({ id: client.id, values: payload });
        toast.success("Client mis à jour.");
      } else {
        await createClient.mutateAsync(payload);
        toast.success("Client créé.");
      }
      onOpenChange(false);
    } catch {
      toast.error("Impossible d'enregistrer le client.");
    }
  }

  const pending = createClient.isPending || updateClient.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier le client" : "Nouveau client"}</SheetTitle>
          <SheetDescription>
            {isEditing ? "Mettez à jour les informations du client." : "Ajoutez un nouveau client à votre répertoire."}
          </SheetDescription>
        </SheetHeader>

        <form
          id="client-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="client-name">Nom</FieldLabel>
                  <Input {...field} id="client-name" placeholder="Acme inc." aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="client-email">Courriel</FieldLabel>
                  <Input {...field} id="client-email" type="email" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="phone"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="client-phone">Téléphone</FieldLabel>
                  <Input {...field} id="client-phone" />
                </Field>
              )}
            />

            <Controller
              name="taxId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="client-taxid">Numéro d&apos;entreprise</FieldLabel>
                  <Input {...field} id="client-taxid" placeholder="TPS/TVQ" />
                </Field>
              )}
            />

            <Controller
              name="notes"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="client-notes">Notes</FieldLabel>
                  <Textarea {...field} id="client-notes" rows={3} />
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="client-form" disabled={pending}>
            {pending && <Spinner />}
            {isEditing ? "Enregistrer" : "Créer le client"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
