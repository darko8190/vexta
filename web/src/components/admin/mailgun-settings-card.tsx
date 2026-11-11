"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useUpdatePlatformSettings } from "@/hooks/use-platform-settings";
import type { PlatformSettings } from "@/lib/types";

const formSchema = z.object({
  mailgunApiKey: z.string().optional(),
  mailgunDomain: z.string().optional(),
  mailgunFromEmail: z.string().email("Courriel invalide.").optional().or(z.literal("")),
  mailgunFromName: z.string().optional(),
  mailgunRegion: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

export function MailgunSettingsCard({ settings }: { settings: PlatformSettings }) {
  const update = useUpdatePlatformSettings();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mailgunApiKey: "",
      mailgunDomain: settings.mailgunDomain ?? "",
      mailgunFromEmail: settings.mailgunFromEmail ?? "",
      mailgunFromName: settings.mailgunFromName ?? "",
      mailgunRegion: settings.mailgunRegion,
    },
  });

  useEffect(() => {
    form.reset({
      mailgunApiKey: "",
      mailgunDomain: settings.mailgunDomain ?? "",
      mailgunFromEmail: settings.mailgunFromEmail ?? "",
      mailgunFromName: settings.mailgunFromName ?? "",
      mailgunRegion: settings.mailgunRegion,
    });
  }, [settings, form]);

  async function onSubmit(values: FormValues) {
    try {
      await update.mutateAsync(values);
      toast.success("Passerelle Mailgun enregistrée.");
      form.setValue("mailgunApiKey", "");
    } catch {
      toast.error("Impossible d'enregistrer la configuration Mailgun.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="size-4" />
            Mailgun
          </CardTitle>
          <Badge variant={settings.mailgunConfigured ? "default" : "outline"}>
            {settings.mailgunConfigured ? "Configuré" : "Non configuré"}
          </Badge>
        </div>
        <CardDescription>Utilisé pour l&apos;envoi des courriels transactionnels de la plateforme.</CardDescription>
      </CardHeader>

      <form id="mailgun-form" onSubmit={form.handleSubmit(onSubmit)}>
        <CardContent>
          <FieldGroup>
            <Controller
              name="mailgunDomain"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="mailgun-domain">Domaine</FieldLabel>
                  <Input {...field} id="mailgun-domain" placeholder="mg.vexta.app" />
                </Field>
              )}
            />
            <Controller
              name="mailgunApiKey"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="mailgun-key">Clé API</FieldLabel>
                  <Input
                    {...field}
                    id="mailgun-key"
                    type="password"
                    autoComplete="off"
                    placeholder={settings.mailgunConfigured ? "••••••••••••••••" : "key-xxxxxxxxxxxx"}
                  />
                  <FieldDescription>Laisser vide pour conserver la clé actuelle.</FieldDescription>
                </Field>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="mailgunFromEmail"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="mailgun-from-email">Courriel d&apos;envoi</FieldLabel>
                    <Input {...field} id="mailgun-from-email" type="email" placeholder="no-reply@vexta.app" />
                  </Field>
                )}
              />
              <Controller
                name="mailgunFromName"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="mailgun-from-name">Nom d&apos;envoi</FieldLabel>
                    <Input {...field} id="mailgun-from-name" placeholder="Vexta" />
                  </Field>
                )}
              />
            </div>
            <Controller
              name="mailgunRegion"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="mailgun-region">Région</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="mailgun-region" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="us">États-Unis (us)</SelectItem>
                      <SelectItem value="eu">Europe (eu)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending && <Spinner />}
            Enregistrer Mailgun
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
