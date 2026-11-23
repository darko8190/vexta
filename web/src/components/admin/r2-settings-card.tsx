"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { HardDrive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useTestR2, useUpdatePlatformSettings } from "@/hooks/use-platform-settings";
import { ApiError } from "@/lib/api";
import type { PlatformSettings } from "@/lib/types";
import { ex } from "@/lib/placeholders";

const formSchema = z.object({
  r2AccountId: z.string().optional(),
  r2AccessKeyId: z.string().optional(),
  r2SecretAccessKey: z.string().optional(),
  r2Bucket: z.string().optional(),
  r2PublicBaseUrl: z
    .string()
    .trim()
    .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "Entrez une adresse commençant par https://")
    .optional(),
});

type FormValues = z.infer<typeof formSchema>;

const CORS_POLICY = `[
  {
    "AllowedOrigins": ["https://votre-domaine.ca"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]`;

export function R2SettingsCard({ settings }: { settings: PlatformSettings }) {
  const update = useUpdatePlatformSettings();
  const test = useTestR2();

  const defaults: FormValues = {
    r2AccountId: settings.r2AccountId ?? "",
    r2AccessKeyId: "",
    r2SecretAccessKey: "",
    r2Bucket: settings.r2Bucket ?? "",
    r2PublicBaseUrl: settings.r2PublicBaseUrl ?? "",
  };

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: defaults });

  useEffect(() => {
    form.reset({
      r2AccountId: settings.r2AccountId ?? "",
      r2AccessKeyId: "",
      r2SecretAccessKey: "",
      r2Bucket: settings.r2Bucket ?? "",
      r2PublicBaseUrl: settings.r2PublicBaseUrl ?? "",
    });
  }, [settings, form]);

  async function onSubmit(values: FormValues) {
    try {
      await update.mutateAsync(values);
      toast.success("Stockage R2 enregistré.");
      form.setValue("r2AccessKeyId", "");
      form.setValue("r2SecretAccessKey", "");
    } catch {
      toast.error("Impossible d'enregistrer la configuration R2.");
    }
  }

  async function onTest() {
    try {
      const result = await test.mutateAsync();
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "La connexion à R2 a échoué.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="size-4" />
            Stockage R2
          </CardTitle>
          <Badge variant={settings.r2Configured ? "default" : "outline"}>
            {settings.r2Configured ? "Configuré" : "Non configuré"}
          </Badge>
        </div>
        <CardDescription>
          Le seau Cloudflare R2 où sont rangés les fichiers de la bibliothèque. Un seul seau pour
          toute la plateforme : chaque locataire est isolé sous son propre préfixe.
        </CardDescription>
      </CardHeader>

      <form id="r2-form" onSubmit={form.handleSubmit(onSubmit)}>
        <CardContent>
          <FieldGroup>
            <Controller
              name="r2AccountId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="r2-account">Identifiant de compte Cloudflare</FieldLabel>
                  <Input {...field} id="r2-account" autoComplete="off" placeholder={ex("a1b2c3…")} />
                </Field>
              )}
            />
            <Controller
              name="r2Bucket"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="r2-bucket">Nom du seau</FieldLabel>
                  <Input {...field} id="r2-bucket" autoComplete="off" placeholder={ex("vexta-medias")} />
                </Field>
              )}
            />
            <Controller
              name="r2AccessKeyId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="r2-key">Clé d&apos;accès</FieldLabel>
                  <Input
                    {...field}
                    id="r2-key"
                    type="password"
                    autoComplete="off"
                    placeholder={settings.r2Configured ? "••••••••••••••••" : "Access Key ID"}
                  />
                  <FieldDescription>Laisser vide pour conserver la clé actuelle.</FieldDescription>
                </Field>
              )}
            />
            <Controller
              name="r2SecretAccessKey"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="r2-secret">Clé secrète</FieldLabel>
                  <Input
                    {...field}
                    id="r2-secret"
                    type="password"
                    autoComplete="off"
                    placeholder={settings.r2Configured ? "••••••••••••••••" : "Secret Access Key"}
                  />
                  <FieldDescription>Laisser vide pour conserver la clé actuelle.</FieldDescription>
                </Field>
              )}
            />
            <Controller
              name="r2PublicBaseUrl"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="r2-public">Domaine public (optionnel)</FieldLabel>
                  <Input
                    {...field}
                    id="r2-public"
                    autoComplete="off"
                    placeholder={ex("https://medias.votre-domaine.ca")}
                    aria-invalid={fieldState.error ? true : undefined}
                  />
                  <FieldDescription>
                    {fieldState.error?.message ??
                      "Sans domaine public, les fichiers restent privés et Vexta génère un lien signé valable 15 minutes. Videz le champ pour revenir au mode privé."}
                  </FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>

          <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-sm font-medium text-foreground">Politique CORS requise sur le seau</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Le navigateur envoie le fichier directement à R2. Sans cette politique, le transfert
              échoue même si les clés sont bonnes.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
              {CORS_POLICY}
            </pre>
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending && <Spinner />}
            Enregistrer R2
          </Button>
          <Button type="button" variant="outline" onClick={onTest} disabled={test.isPending}>
            {test.isPending && <Spinner />}
            Tester la connexion
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
