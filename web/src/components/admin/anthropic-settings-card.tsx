"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { ScanText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useUpdatePlatformSettings } from "@/hooks/use-platform-settings";
import type { PlatformSettings } from "@/lib/types";

const formSchema = z.object({
  anthropicApiKey: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * The key that lets a receipt be read by a model.
 *
 * Alone among the integrations in being billed per use, which is why the card says so and why
 * the quantity is not set here: how many receipts a company may have read belongs to its plan,
 * beside the number of seats it is sold.
 */
export function AnthropicSettingsCard({ settings }: { settings: PlatformSettings }) {
  const update = useUpdatePlatformSettings();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { anthropicApiKey: "" },
  });

  useEffect(() => {
    form.reset({ anthropicApiKey: "" });
  }, [settings, form]);

  async function onSubmit(values: FormValues) {
    try {
      await update.mutateAsync(values);
      toast.success("Clé de lecture de reçus enregistrée.");
      form.setValue("anthropicApiKey", "");
    } catch {
      toast.error("Impossible d'enregistrer cette clé.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanText className="size-4" />
            Lecture de reçus
          </CardTitle>
          <Badge variant={settings.anthropicConfigured ? "default" : "outline"}>
            {settings.anthropicConfigured ? "Configuré" : "Non configuré"}
          </Badge>
        </div>
        <CardDescription>
          Lit le montant, les taxes, la date et le fournisseur sur la photo d&apos;un reçu, pour
          préremplir une dépense.
        </CardDescription>
      </CardHeader>

      <form id="anthropic-form" onSubmit={form.handleSubmit(onSubmit)}>
        <CardContent>
          <FieldGroup>
            <Controller
              name="anthropicApiKey"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="anthropic-key">Clé d&apos;API Anthropic</FieldLabel>
                  <Input
                    {...field}
                    id="anthropic-key"
                    type="password"
                    autoComplete="off"
                    placeholder={settings.anthropicConfigured ? "••••••••••••••••" : "sk-ant-…"}
                  />
                  <FieldDescription>
                    Laisser vide pour conserver la clé actuelle. Elle se crée sur{" "}
                    <code>console.anthropic.com</code>.
                  </FieldDescription>
                </Field>
              )}
            />

            {/* Said here and nowhere else, because this is the only integration whose cost grows
                with usage — et c'est vous qui la payez, pas le locataire. */}
            <FieldDescription>
              C&apos;est la seule intégration facturée à l&apos;usage : environ deux cents par
              reçu lu. Combien de lectures une entreprise obtient par mois se
              règle sur son <strong>forfait</strong>, pas ici — un forfait à zéro n&apos;offre
              pas la fonction du tout.
            </FieldDescription>
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending && <Spinner />}
            Enregistrer la clé
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
