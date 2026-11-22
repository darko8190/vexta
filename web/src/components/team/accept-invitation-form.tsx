"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PasswordInput } from "@/components/auth/password-input";
import { useAuth } from "@/lib/auth-context";

// 10 characters, matching the API's Identity options. Stating the rule beats failing on it.
const MIN_LENGTH = 10;

const formSchema = z
  .object({
    password: z.string().min(MIN_LENGTH, `Au moins ${MIN_LENGTH} caractères.`),
    confirmation: z.string().min(1, "Confirmez votre mot de passe."),
  })
  .refine((values) => values.password === values.confirmation, {
    message: "Les deux mots de passe ne sont pas identiques.",
    path: ["confirmation"],
  });

type FormValues = z.infer<typeof formSchema>;

export function AcceptInvitationForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: "", confirmation: "" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const response = await fetch(`/api/invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: values.password }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setServerError(data?.message ?? "Impossible d'activer cet accès.");
        return;
      }

      // The accept route already set the session cookie; refresh picks the user up.
      await refresh();
      router.push("/tableau-de-bord");
    } catch {
      setServerError("Le service est momentanément injoignable. Réessayez dans un instant.");
    }
  }

  return (
    <form className="mt-6" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="invite-email">Courriel</FieldLabel>
          {/* Shown, not editable: it is the address the invitation was issued for. */}
          <Input id="invite-email" value={email} readOnly disabled autoComplete="username" />
          <FieldDescription>C&apos;est l&apos;identifiant avec lequel vous vous connecterez.</FieldDescription>
        </Field>

        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="invite-password">Mot de passe</FieldLabel>
              <PasswordInput
                {...field}
                id="invite-password"
                autoComplete="new-password"
                placeholder="••••••••••"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid ? (
                <FieldError errors={[fieldState.error]} />
              ) : (
                <FieldDescription>Au moins {MIN_LENGTH} caractères.</FieldDescription>
              )}
            </Field>
          )}
        />

        <Controller
          name="confirmation"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="invite-confirmation">Confirmer le mot de passe</FieldLabel>
              <PasswordInput
                {...field}
                id="invite-confirmation"
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
          Activer mon accès
        </Button>
      </FieldGroup>
    </form>
  );
}
