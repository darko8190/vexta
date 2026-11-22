"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
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
import { useSaveEmployee } from "@/hooks/use-team";
import { ApiError } from "@/lib/api";
import type { Employee } from "@/lib/types";

const formSchema = z.object({
  firstName: z.string().trim().min(1, "Le prénom est requis.").max(100, "100 caractères maximum."),
  lastName: z.string().trim().min(1, "Le nom est requis.").max(100, "100 caractères maximum."),
  email: z.string().trim().min(1, "Le courriel est requis.").email("Courriel invalide."),
  jobTitle: z.string().trim().max(100, "100 caractères maximum."),
  phone: z.string().trim().max(40, "40 caractères maximum."),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(employee?: Employee): FormValues {
  return {
    firstName: employee?.firstName ?? "",
    lastName: employee?.lastName ?? "",
    email: employee?.email ?? "",
    jobTitle: employee?.jobTitle ?? "",
    phone: employee?.phone ?? "",
  };
}

export function EmployeeFormSheet({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: Employee;
}) {
  const isEditing = Boolean(employee);
  const save = useSaveEmployee();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(employee),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(employee));
  }, [open, employee, form]);

  // The address doubles as the sign-in name once access exists, so the API refuses to change it
  // while an account is attached. Saying so here beats letting them type and be refused.
  const emailLocked = isEditing && Boolean(employee?.hasAccess);

  async function onSubmit(values: FormValues) {
    try {
      await save.mutateAsync({
        id: employee?.id,
        values: {
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          jobTitle: values.jobTitle ? values.jobTitle : null,
          phone: values.phone ? values.phone : null,
        },
      });
      toast.success(isEditing ? "Employé mis à jour." : "Employé ajouté.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer cet employé.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier l'employé" : "Nouvel employé"}</SheetTitle>
          <SheetDescription>
            La fiche existe indépendamment de l&apos;accès. Ajoutez la personne ici, puis donnez-lui
            un accès si elle doit se connecter.
          </SheetDescription>
        </SheetHeader>

        <form
          id="employee-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="firstName"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="employee-firstname">
                    Prénom
                    <RequiredMark />
                  </FieldLabel>
                  <Input {...field} id="employee-firstname" placeholder="Marie" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="lastName"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="employee-lastname">
                    Nom
                    <RequiredMark />
                  </FieldLabel>
                  <Input {...field} id="employee-lastname" placeholder="Tremblay" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="employee-email">
                    Courriel
                    <RequiredMark />
                  </FieldLabel>
                  <Input
                    {...field}
                    id="employee-email"
                    type="email"
                    autoComplete="off"
                    placeholder="marie@entreprise.com"
                    disabled={emailLocked}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>
                      {emailLocked
                        ? "Retirez l'accès pour pouvoir changer le courriel : c'est aussi son identifiant de connexion."
                        : "C'est là que part l'invitation, et l'identifiant de connexion."}
                    </FieldDescription>
                  )}
                </Field>
              )}
            />

            <Controller
              name="jobTitle"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="employee-jobtitle">Titre</FieldLabel>
                  <Input {...field} id="employee-jobtitle" placeholder="Chargée de projet" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="phone"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="employee-phone">Téléphone</FieldLabel>
                  <Input {...field} id="employee-phone" type="tel" placeholder="514 555-0199" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="employee-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {isEditing ? "Enregistrer" : "Ajouter l'employé"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
