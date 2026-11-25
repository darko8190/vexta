"use client";

import { useState } from "react";
import { BellRing, ClipboardPen, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { useBillingSettingsQuery, useSaveQuoteReminder, useSaveQuoteTerms } from "@/hooks/use-billing-settings";
import { useDeleteQuoteTemplate, useQuoteTemplatesQuery } from "@/hooks/use-quotes";
import { ApiError } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import { ex } from "@/lib/placeholders";
import type { QuoteTemplate } from "@/lib/types";

/**
 * The conditions printed on every quote, above the signature: what the client agrees to along
 * with the price. Separate from the invoice's payment terms, which say when to pay, not what
 * the work includes.
 */
export function QuoteTermsCard() {
  const { data: settings, isLoading } = useBillingSettingsQuery();
  const save = useSaveQuoteTerms();
  // Null until typed, so the saved text shows through without being copied into state.
  const [draft, setDraft] = useState<string | null>(null);
  const terms = draft ?? settings?.quoteTerms ?? "";

  async function onSave() {
    try {
      await save.mutateAsync(terms);
      toast.success("Conditions des soumissions enregistrées.");
      setDraft(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer les conditions.");
    }
  }

  if (isLoading || !settings) return <Skeleton className="h-64 max-w-3xl" />;

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" />
          Conditions des soumissions
        </CardTitle>
        <CardDescription>
          Imprimées sur chaque soumission, au-dessus de la signature : garantie, délais,
          exclusions. Le client les accepte avec le prix.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Field>
          <FieldLabel htmlFor="quote-terms">Conditions</FieldLabel>
          <Textarea
            id="quote-terms"
            rows={8}
            maxLength={4000}
            value={terms}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={ex("Garantie d'un an sur la main-d'œuvre. Prix valides selon la date indiquée. Les travaux imprévus sont facturés à part.")}
          />
          <FieldDescription>Facultatif : laissé vide, rien ne s&apos;imprime.</FieldDescription>
        </Field>
      </CardContent>
      <CardFooter>
        <Button onClick={onSave} disabled={save.isPending || draft === null}>
          {save.isPending && <Spinner />}
          Enregistrer
        </Button>
      </CardFooter>
    </Card>
  );
}

const DEFAULT_REMINDER_DAYS = 7;

/**
 * The reminder sent by itself to a client who has not answered. Off until turned on: an email
 * in the company's name only leaves on its own once the company has asked for it.
 */
export function QuoteReminderCard() {
  const { data: settings, isLoading } = useBillingSettingsQuery();
  const save = useSaveQuoteReminder();
  // Null until changed, so the saved value shows through without being copied into state.
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [days, setDays] = useState<string | null>(null);

  const saved = settings?.quoteReminderDays ?? null;
  const on = enabled ?? saved != null;
  const daysText = days ?? String(saved ?? DEFAULT_REMINDER_DAYS);
  const parsed = Number(daysText);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 90;
  const next = on ? parsed : null;
  const dirty = next !== saved;

  async function onSave() {
    try {
      await save.mutateAsync(next);
      toast.success(next == null ? "Relance automatique désactivée." : "Relance automatique enregistrée.");
      setEnabled(null);
      setDays(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer la relance.");
    }
  }

  if (isLoading || !settings) return <Skeleton className="h-48 max-w-3xl" />;

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="size-4" />
          Relance automatique
        </CardTitle>
        <CardDescription>
          Une soumission envoyée qui reste sans réponse est relancée une fois, toute seule, à la
          personne qui l&apos;a reçue, avec le PDF. Pas si elle est expirée, acceptée ou refusée.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field>
          <div className="flex items-center gap-3">
            <Checkbox id="quote-reminder-on" checked={on} onCheckedChange={(checked) => setEnabled(checked === true)} />
            <FieldLabel htmlFor="quote-reminder-on" className="font-normal">
              Relancer automatiquement les soumissions sans réponse
            </FieldLabel>
          </div>
        </Field>
        {on && (
          <Field className="max-w-xs">
            <FieldLabel htmlFor="quote-reminder-days">Délai après l&apos;envoi (jours)</FieldLabel>
            <Input
              id="quote-reminder-days"
              type="number"
              inputMode="numeric"
              min={1}
              max={90}
              value={daysText}
              onChange={(event) => setDays(event.target.value)}
              aria-invalid={!valid}
            />
            <FieldDescription>
              {valid ? "Entre 1 et 90 jours, comptés à partir du dernier envoi." : "Indiquez un nombre de jours entre 1 et 90."}
            </FieldDescription>
          </Field>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={onSave} disabled={save.isPending || !dirty || (on && !valid)}>
          {save.isPending && <Spinner />}
          Enregistrer
        </Button>
      </CardFooter>
    </Card>
  );
}

/**
 * The templates kept so far. They are made from a quote (« Enregistrer comme modèle ») and used
 * when creating one (« Partir d'un modèle »), so this card only lists them and removes them.
 */
export function QuoteTemplatesCard() {
  const { data: templates, isLoading } = useQuoteTemplatesQuery();
  const remove = useDeleteQuoteTemplate();
  const [target, setTarget] = useState<QuoteTemplate | undefined>(undefined);

  async function confirmDelete() {
    if (!target) return;
    try {
      await remove.mutateAsync(target.id);
      toast.success("Modèle supprimé.");
      setTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer le modèle.");
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardPen className="size-4" />
          Modèles de soumission
        </CardTitle>
        <CardDescription>
          Créés depuis une soumission avec « Enregistrer comme modèle », et choisis avec « Partir
          d&apos;un modèle » en créant une nouvelle soumission.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !templates || templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun modèle pour l&apos;instant. Ouvrez une soumission bien montée et cliquez
            « Enregistrer comme modèle ».
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {templates.map((template) => (
              <li key={template.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{template.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {template.lineCount === 1 ? "1 ligne" : `${template.lineCount} lignes`} ·{" "}
                    {formatAmount(template.subtotal)} avant taxes
                    {template.depositPercent != null ? ` · acompte de ${template.depositPercent} %` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Supprimer le modèle ${template.name}`}
                  onClick={() => setTarget(template)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <ConfirmDeleteDialog
        open={Boolean(target)}
        onOpenChange={(open) => !open && setTarget(undefined)}
        title="Supprimer ce modèle ?"
        description={`Le modèle « ${target?.name ?? ""} » sera supprimé. Les soumissions déjà créées à partir de lui ne changent pas.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </Card>
  );
}
