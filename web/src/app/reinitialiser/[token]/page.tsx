"use client";

import { use, useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { AuthCard } from "@/components/auth/auth-card";
import { PasswordInput } from "@/components/auth/password-input";
import { PASSWORD_HINT, passwordSchema } from "@/lib/password";

const formSchema = z
  .object({
    password: passwordSchema,
    confirmation: z.string().min(1, "Confirmez le mot de passe."),
  })
  .refine((values) => values.password === values.confirmation, {
    message: "Les deux mots de passe ne sont pas identiques.",
    path: ["confirmation"],
  });

type FormValues = z.infer<typeof formSchema>;

/**
 * Pattern 3 — Form (auth). The end of the emailed link.
 *
 * The token is never checked before the form is shown. Checking it would mean an extra round
 * trip whose only outcome is burning the one-shot token early, and the refusal reads the same
 * whether it comes before or after the password is typed.
 *
 * No session is opened on success. Whoever holds the link gets to set the password, not to walk
 * in — so a link that reached the wrong inbox costs a password and not an account.
 */
export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: "", confirmation: "" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const response = await fetch("/api/auth/reinitialiser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: values.password }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setServerError(data?.message ?? "Le changement n'a pas abouti. Réessayez.");
        return;
      }

      setDone(true);
    } catch {
      setServerError("Le serveur est injoignable. Réessayez dans quelques minutes.");
    }
  }

  if (done) {
    return (
      <AuthCard>
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-primary/10">
            <CircleCheck className="size-5 text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-card-foreground">Mot de passe changé</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Connectez-vous avec votre nouveau mot de passe.
          </p>
          <Link
            href="/connexion"
            className="mt-6 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Aller à la connexion
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <h1 className="text-center text-xl font-semibold text-card-foreground">Nouveau mot de passe</h1>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        Choisissez-en un que vous n&apos;utilisez pas ailleurs.
      </p>

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="mt-6">
        <FieldGroup>
          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="reset-password">Mot de passe</FieldLabel>
                <PasswordInput
                  {...field}
                  id="reset-password"
                  autoComplete="new-password"
                  placeholder="••••••••••"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : (
                  <FieldDescription>{PASSWORD_HINT}</FieldDescription>
                )}
              </Field>
            )}
          />

          <Controller
            name="confirmation"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="reset-confirmation">Confirmation</FieldLabel>
                <PasswordInput
                  {...field}
                  id="reset-confirmation"
                  autoComplete="new-password"
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
            Changer mon mot de passe
          </Button>
        </FieldGroup>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Lien expiré ?{" "}
        <Link href="/mot-de-passe-oublie" className="font-medium text-primary hover:underline">
          Demandez-en un nouveau
        </Link>
      </p>
    </AuthCard>
  );
}
