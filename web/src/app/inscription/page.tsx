"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PasswordInput } from "@/components/auth/password-input";
import { SocialButtons } from "@/components/auth/social-buttons";
import { VextaLogo } from "@/components/brand/vexta-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/lib/auth-context";

const formSchema = z
  .object({
    accountType: z.enum(["business", "personal"]),
    companyName: z.string(),
    firstName: z.string().min(1, "Prénom requis."),
    lastName: z.string().min(1, "Nom requis."),
    email: z.string().min(1, "Le courriel est requis.").email("Courriel invalide."),
    password: z.string().min(10, "Au moins 10 caractères."),
  })
  // A travailleur autonome has no company name to give; their space is named after them.
  .refine((values) => values.accountType === "personal" || values.companyName.trim().length >= 2, {
    message: "Nom d'entreprise requis.",
    path: ["companyName"],
  });

type FormValues = z.infer<typeof formSchema>;

/** Both kinds get the same isolated space — only what it is named differs. */
function spaceNameFor(values: FormValues) {
  return values.accountType === "personal"
    ? `${values.firstName.trim()} ${values.lastName.trim()}`.trim()
    : values.companyName.trim();
}

export default function RegisterPage() {
  const { registerTenant } = useAuth();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      accountType: "business",
      companyName: "",
      firstName: "",
      lastName: "",
      email: "",
      password: "",
    },
  });

  // useWatch, not form.watch: the latter returns a fresh function each render, which opts the
  // whole component out of React Compiler memoisation.
  const accountType = useWatch({ control: form.control, name: "accountType" });
  const isPersonal = accountType === "personal";

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const result = await registerTenant({
        companyName: spaceNameFor(values),
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
        kind: values.accountType === "personal" ? "Personal" : "Business",
      });

      // Free spaces skip Stripe entirely and land straight in the app.
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
      } else {
        router.push("/tableau-de-bord");
      }
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Une erreur est survenue.");
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="mb-8 flex flex-col items-center gap-2">
        <Link href="/" aria-label="Vexta — accueil" className="transition-opacity hover:opacity-70">
          <VextaLogo className="w-44" priority />
        </Link>
      </div>

      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-center text-xl font-semibold text-card-foreground">Créer votre espace Vexta</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {isPersonal
            ? "Gratuit pour les travailleurs autonomes — aucune carte demandée."
            : "Abonnement mensuel — paiement sécurisé par Stripe à l'étape suivante."}
        </p>

        <Controller
          name="accountType"
          control={form.control}
          render={({ field }) => (
            <Tabs
              value={field.value}
              onValueChange={(value) => field.onChange(value)}
              className="mt-6"
            >
              <TabsList className="w-full">
                <TabsTrigger value="business" className="flex-1">
                  Entreprise
                </TabsTrigger>
                <TabsTrigger value="personal" className="flex-1">
                  Personnel
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        />

        <div className="mt-6">
          <SocialButtons action="signup" />
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            {!isPersonal && (
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
            )}

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

            {isPersonal && (
              <FieldDescription>
                Votre espace portera votre nom, et il est gratuit — mêmes fonctions que
                l&apos;offre entreprise, sans abonnement.
              </FieldDescription>
            )}

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
              {isPersonal ? "Créer mon espace" : "Continuer vers le paiement"}
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
