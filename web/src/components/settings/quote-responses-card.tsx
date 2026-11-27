"use client";

import { useState } from "react";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useBillingSettingsQuery, useSaveQuoteResponses } from "@/hooks/use-billing-settings";
import { ApiError } from "@/lib/api";

type Answers = { canApprove: boolean; canRequestChange: boolean; canRefuse: boolean };

/**
 * What the client may do straight from the quote's email, without an account: approve it, ask
 * for a change, refuse it. Each allowed answer is a link in the message.
 */
export function QuoteResponsesCard() {
  const { data: settings, isLoading } = useBillingSettingsQuery();
  const save = useSaveQuoteResponses();
  const [draft, setDraft] = useState<Answers | null>(null);

  const saved: Answers = {
    canApprove: settings?.quoteEmailCanApprove ?? true,
    canRequestChange: settings?.quoteEmailCanRequestChange ?? true,
    canRefuse: settings?.quoteEmailCanRefuse ?? true,
  };
  const answers = draft ?? saved;

  async function onSave() {
    try {
      await save.mutateAsync(answers);
      setDraft(null);
      toast.success("Réponses par courriel enregistrées.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer.");
    }
  }

  const options: { key: keyof Answers; label: string; hint: string }[] = [
    { key: "canApprove", label: "Approuver la soumission", hint: "Le client tape son nom pour signer. Elle passe à « Acceptée », prête à devenir un projet." },
    { key: "canRequestChange", label: "Demander une modification", hint: "Le client écrit ce qu'il veut changer ; vous le voyez sur la soumission." },
    { key: "canRefuse", label: "Refuser la soumission", hint: "Avec une raison s'il le souhaite." },
  ];

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MailCheck className="size-4" />
          Réponse depuis le courriel
        </CardTitle>
        <CardDescription>
          Ce que le client peut faire directement depuis le courriel de la soumission, sans compte. Chaque réponse
          permise devient un lien dans le message.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          options.map((option) => (
            <Field key={option.key} orientation="horizontal">
              <Checkbox
                id={`quote-response-${option.key}`}
                checked={answers[option.key]}
                onCheckedChange={(checked) => setDraft({ ...answers, [option.key]: checked === true })}
              />
              <div>
                <FieldLabel htmlFor={`quote-response-${option.key}`} className="font-normal">
                  {option.label}
                </FieldLabel>
                <FieldDescription>{option.hint}</FieldDescription>
              </div>
            </Field>
          ))
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={onSave} disabled={save.isPending || !draft}>
          {save.isPending && <Spinner />}
          Enregistrer
        </Button>
      </CardFooter>
    </Card>
  );
}
