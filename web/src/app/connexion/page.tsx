"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PasswordInput } from "@/components/auth/password-input";
import { SocialButtons } from "@/components/auth/social-buttons";
import { VextaLogo } from "@/components/brand/vexta-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/lib/auth-context";
import { ex } from "@/lib/placeholders";

const formSchema = z.object({
  email: z.string().min(1, "Le courriel est requis.").email("Courriel invalide."),
  password: z.string().min(1, "Le mot de passe est requis."),
});

type FormValues = z.infer<typeof formSchema>;

const externalErrors: Record<string, string> = {
  externe: "La connexion avec ce fournisseur n'a pas abouti. Réessayez.",
  "courriel-absent": "Ce fournisseur n'a pas partagé votre courriel, sans quoi nous ne pouvons pas vous reconnaître.",
  "fournisseur-inconnu": "Ce fournisseur n'est pas activé sur Vexta.",
};

// Its own component because useSearchParams suspends, and the form must not wait on it.
function ExternalError() {
  const params = useSearchParams();
  const code = params.get("erreur");

  // Set when the app sent the person here rather than them arriving on their own. The status is
  // named because "you were signed out" and "the server refused" look identical from the chair,
  // and only one of them is the person's problem.
  const session = params.get("session");

  if (!code && !session) return null;

  const message = code
    ? externalErrors[code] ?? "La connexion n'a pas abouti. Réessayez."
    : session === "1"
      ? "Votre session a pris fin. Reconnectez-vous."
      : `Votre session a pris fin (code ${session}). Reconnectez-vous.`;

  return (
    <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await login(values.email, values.password);
      router.push("/tableau-de-bord");
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

      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-center text-xl font-semibold text-card-foreground">Connexion</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Accédez à votre espace Vexta.
        </p>

        <div className="mt-6">
          <Suspense fallback={null}>
            <ExternalError />
          </Suspense>
          <SocialButtons action="login" />
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="login-email">Courriel</FieldLabel>
                  <Input
                    {...field}
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    placeholder={ex("vous@entreprise.com")}
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
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel htmlFor="login-password">Mot de passe</FieldLabel>
                    {/* Beside the field it concerns rather than at the bottom of the card:
                        this is looked for at the moment the password will not come to mind. */}
                    <Link
                      href="/mot-de-passe-oublie"
                      className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Mot de passe oublié ?
                    </Link>
                  </div>
                  <PasswordInput
                    {...field}
                    id="login-password"
                    placeholder="••••••••••"
                    aria-invalid={fieldState.invalid}
                  />
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
              Se connecter
            </Button>
          </FieldGroup>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="font-medium text-primary hover:underline">
            Créer votre espace Vexta
          </Link>
        </p>
      </div>
    </div>
  );
}
