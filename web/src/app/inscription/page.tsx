"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PasswordInput } from "@/components/auth/password-input";
import { useAuth } from "@/lib/auth-context";

const formSchema = z.object({
  companyName: z.string().min(2, "Nom d'entreprise requis."),
  firstName: z.string().min(1, "Prénom requis."),
  lastName: z.string().min(1, "Nom requis."),
  email: z.string().min(1, "Le courriel est requis.").email("Courriel invalide."),
  password: z.string().min(10, "Au moins 10 caractères."),
});

type FormValues = z.infer<typeof formSchema>;

export default function RegisterPage() {
  const { registerTenant } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { companyName: "", firstName: "", lastName: "", email: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const { checkoutUrl } = await registerTenant(values);
      window.location.assign(checkoutUrl);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Une erreur est survenue.");
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-2">
        <Link href="/" aria-label="Vexta — accueil" className="transition-opacity hover:opacity-70">
          <Image src="/vexta-logo.png" alt="Vexta" width={180} height={90} priority className="h-auto w-44" />
        </Link>
      </div>

      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-center text-xl font-semibold text-card-foreground">Créer votre espace Vexta</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Abonnement mensuel — paiement sécurisé par Stripe à l&apos;étape suivante.
        </p>

        <form className="mt-6" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Controller
              name="companyName"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="reg-company">Nom de l&apos;entreprise</FieldLabel>
                  <Input {...field} id="reg-company" placeholder="Acme inc." aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="firstName"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="reg-firstname">Prénom</FieldLabel>
                    <Input {...field} id="reg-firstname" autoComplete="given-name" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="lastName"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="reg-lastname">Nom</FieldLabel>
                    <Input {...field} id="reg-lastname" autoComplete="family-name" aria-invalid={fieldState.invalid} />
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
                  <FieldLabel htmlFor="reg-email">Courriel</FieldLabel>
                  <Input
                    {...field}
                    id="reg-email"
                    type="email"
                    autoComplete="email"
                    placeholder="vous@entreprise.com"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="reg-password">Mot de passe</FieldLabel>
                  <PasswordInput
                    {...field}
                    id="reg-password"
                    autoComplete="new-password"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>Au moins 10 caractères.</FieldDescription>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            {serverError && (
              <p className="text-sm font-medium text-destructive" role="alert">
                {serverError}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Spinner />}
              Continuer vers le paiement
            </Button>
          </FieldGroup>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Déjà un compte ?{" "}
          <Link href="/connexion" className="font-medium text-primary hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
