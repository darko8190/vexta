"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { AuthCard } from "@/components/auth/auth-card";

const formSchema = z.object({
  email: z.string().min(1, "Le courriel est requis.").email("Courriel invalide."),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Pattern 3 — Form (auth).
 *
 * One field, then a sentence that says the same thing whether or not the address has an
 * account. The screen deliberately cannot tell you who has a Vexta account: a different answer
 * for a known address would make this page a way of checking which of your competitors are
 * customers here.
 */
export default function ForgotPasswordPage() {
  const [sent, setSent] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const response = await fetch("/api/auth/mot-de-passe-oublie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setServerError(data?.message ?? "La demande n'a pas abouti. Réessayez.");
        return;
      }

      setSent(data?.message ?? "Si un compte utilise cette adresse, un lien vient d'y être envoyé.");
    } catch {
      setServerError("Le serveur est injoignable. Réessayez dans quelques minutes.");
    }
  }

  if (sent) {
    return (
      <AuthCard>
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-primary/10">
            <MailCheck className="size-5 text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-card-foreground">Vérifiez vos courriels</h1>
          <p className="mt-2 text-sm text-muted-foreground">{sent}</p>
          <p className="mt-2 text-sm text-muted-foreground">Le lien est valide deux heures.</p>
          <Link
            href="/connexion"
            className="mt-6 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Retour à la connexion
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <h1 className="text-center text-xl font-semibold text-card-foreground">Mot de passe oublié</h1>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        Entrez votre courriel et nous vous enverrons un lien pour en choisir un nouveau.
      </p>

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="mt-6">
        <FieldGroup>
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="forgot-email">Courriel</FieldLabel>
                <Input
                  {...field}
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  placeholder="vous@entreprise.com"
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
            Envoyer le lien
          </Button>
        </FieldGroup>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/connexion" className="font-medium text-primary hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </AuthCard>
  );
}
