"use client";

import { useState } from "react";
import { BellRing, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  useBillingSettingsQuery,
  useSaveInvoiceReminder,
  useSaveQuoteReminder,
  useSaveQuoteTerms,
} from "@/hooks/use-billing-settings";
import { ApiError } from "@/lib/api";
import { ex } from "@/lib/placeholders";

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
/** The API's ceiling: past a few, it is no longer a reminder. */
const MAX_REMINDERS = 5;

/** The wording that differs between the two reminders; everything else is the same card. */
const reminderCopy = {
  soumission: {
    title: "Relance automatique",
    description:
      "Une soumission envoyée qui reste sans réponse est relancée toute seule, à la personne qui l'a reçue, avec le PDF. Pas si elle est expirée, acceptée ou refusée.",
    checkbox: "Relancer automatiquement les soumissions sans réponse",
    days: "Délai après l'envoi (jours)",
    hint: "Entre 1 et 90 jours, comptés depuis l'envoi, puis depuis la relance précédente.",
  },
  facture: {
    title: "Relance des factures impayées",
    description:
      "Une facture envoyée qui n'est pas payée après son échéance est relancée toute seule, à la personne qui l'a reçue : le PDF, le solde dû et le bouton de paiement en ligne si vous l'offrez.",
    checkbox: "Relancer automatiquement les factures impayées",
    days: "Délai après l'échéance (jours)",
    hint: "Entre 1 et 90 jours après l'échéance, puis après la relance précédente.",
  },
} as const;

/**
 * The reminder sent by itself to a client who has not answered. Off until turned on: an email
 * in the company's name only leaves on its own once the company has asked for it.
 */
export function QuoteReminderCard() {
  return <ReminderCard kind="soumission" />;
}

/** The same, for invoices still unpaid past their due date. */
export function InvoiceReminderCard() {
  return <ReminderCard kind="facture" />;
}

function ReminderCard({ kind }: { kind: keyof typeof reminderCopy }) {
  const copy = reminderCopy[kind];
  const { data: settings, isLoading } = useBillingSettingsQuery();
  const saveQuote = useSaveQuoteReminder();
  const saveInvoice = useSaveInvoiceReminder();
  const save = kind === "facture" ? saveInvoice : saveQuote;
  // Null until changed, so the saved value shows through without being copied into state.
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [days, setDays] = useState<string | null>(null);
  const [count, setCount] = useState<string | null>(null);

  const saved = (kind === "facture" ? settings?.invoiceReminderDays : settings?.quoteReminderDays) ?? null;
  const on = enabled ?? saved != null;
  const daysText = days ?? String(saved ?? DEFAULT_REMINDER_DAYS);
  const parsed = Number(daysText);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 90;
  const next = on ? parsed : null;
  const savedCount = (kind === "facture" ? settings?.invoiceReminderCount : settings?.quoteReminderCount) ?? 1;
  const countText = count ?? String(savedCount);
  const parsedCount = Number(countText);
  const countValid = Number.isInteger(parsedCount) && parsedCount >= 1 && parsedCount <= MAX_REMINDERS;
  const dirty = next !== saved || (on && parsedCount !== savedCount);

  async function onSave() {
    try {
      await save.mutateAsync({ days: next, count: on ? parsedCount : undefined });
      toast.success(next == null ? "Relance automatique désactivée." : "Relance automatique enregistrée.");
      setEnabled(null);
      setDays(null);
      setCount(null);
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
          {copy.title}
        </CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field>
          <div className="flex items-center gap-3">
            <Checkbox id={`${kind}-reminder-on`} checked={on} onCheckedChange={(checked) => setEnabled(checked === true)} />
            <FieldLabel htmlFor={`${kind}-reminder-on`} className="font-normal">
              {copy.checkbox}
            </FieldLabel>
          </div>
        </Field>
        {on && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${kind}-reminder-count`}>Nombre de relances</FieldLabel>
              <Input
                id={`${kind}-reminder-count`}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_REMINDERS}
                value={countText}
                onChange={(event) => setCount(event.target.value)}
                aria-invalid={!countValid}
              />
              <FieldDescription>
                {countValid
                  ? `Par envoi, entre 1 et ${MAX_REMINDERS}. Renvoyer à la main remet le compte à zéro.`
                  : `Indiquez un nombre entre 1 et ${MAX_REMINDERS}.`}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${kind}-reminder-days`}>{copy.days}</FieldLabel>
              <Input
                id={`${kind}-reminder-days`}
                type="number"
                inputMode="numeric"
                min={1}
                max={90}
                value={daysText}
                onChange={(event) => setDays(event.target.value)}
                aria-invalid={!valid}
              />
              <FieldDescription>
                {valid ? copy.hint : "Indiquez un nombre de jours entre 1 et 90."}
              </FieldDescription>
            </Field>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={onSave} disabled={save.isPending || !dirty || (on && (!valid || !countValid))}>
          {save.isPending && <Spinner />}
          Enregistrer
        </Button>
      </CardFooter>
    </Card>
  );
}

