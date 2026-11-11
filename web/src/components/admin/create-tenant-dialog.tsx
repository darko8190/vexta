"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PasswordInput } from "@/components/auth/password-input";
import { useCreateTenant } from "@/hooks/use-tenants";

const formSchema = z.object({
  companyName: z.string().min(2, "Nom d'entreprise requis."),
  adminFirstName: z.string().min(1, "Prénom requis."),
  adminLastName: z.string().min(1, "Nom requis."),
  adminEmail: z.string().min(1, "Courriel requis.").email("Courriel invalide."),
  adminPassword: z.string().min(10, "Au moins 10 caractères."),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateTenantDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const createTenant = useCreateTenant();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { companyName: "", adminFirstName: "", adminLastName: "", adminEmail: "", adminPassword: "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      await createTenant.mutateAsync(values);
      toast.success("Locataire créé avec un abonnement actif.");
      form.reset();
      onOpenChange(false);
    } catch {
      toast.error("Impossible de créer ce locataire.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau locataire</DialogTitle>
          <DialogDescription>
            Crée directement une entreprise avec un abonnement actif, sans passer par Stripe.
          </DialogDescription>
        </DialogHeader>

        <form id="tenant-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Controller
              name="companyName"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="tenant-company">Nom de l&apos;entreprise</FieldLabel>
                  <Input {...field} id="tenant-company" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="adminFirstName"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="tenant-first">Prénom admin</FieldLabel>
                    <Input {...field} id="tenant-first" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="adminLastName"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="tenant-last">Nom admin</FieldLabel>
                    <Input {...field} id="tenant-last" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>
            <Controller
              name="adminEmail"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="tenant-email">Courriel admin</FieldLabel>
                  <Input {...field} id="tenant-email" type="email" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="adminPassword"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="tenant-password">Mot de passe temporaire</FieldLabel>
                  <PasswordInput {...field} id="tenant-password" autoComplete="new-password" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
          <Button type="submit" form="tenant-form" disabled={createTenant.isPending}>
            {createTenant.isPending && <Spinner />}
            Créer le locataire
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
