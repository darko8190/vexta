"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Mail, RotateCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  useBillingSettingsQuery,
  useEmailPreviewQuery,
  useSaveEmailTemplate,
  type BillingSettings,
  type EmailTemplateKind,
} from "@/hooks/use-billing-settings";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiError } from "@/lib/api";

/** Which of the two fields a clicked token goes into. */
type Target = "subject" | "body";

/** What differs between the two documents: the words on the card and where the row keeps them. */
const kinds = {
  facture: {
    title: "Courriel de facturation",
    description: "Le message avec lequel une facture part.",
    document: "la facture",
    sample: "une facture d'exemple",
    saved: "Courriel de facturation enregistré.",
    read: (s: BillingSettings) => ({
      subject: s.invoiceEmailSubject,
      body: s.invoiceEmailBody,
      defaultSubject: s.defaultInvoiceEmailSubject,
      defaultBody: s.defaultInvoiceEmailBody,
      fields: s.invoiceEmailFields,
    }),
  },
  soumission: {
    title: "Courriel de soumission",
    description: "Le message avec lequel une soumission part.",
    document: "la soumission",
    sample: "une soumission d'exemple",
    saved: "Courriel de soumission enregistré.",
    read: (s: BillingSettings) => ({
      subject: s.quoteEmailSubject,
      body: s.quoteEmailBody,
      defaultSubject: s.defaultQuoteEmailSubject,
      defaultBody: s.defaultQuoteEmailBody,
      fields: s.quoteEmailFields,
    }),
  },
} satisfies Record<EmailTemplateKind, unknown>;

export function EmailTemplateCard({ kind }: { kind: EmailTemplateKind }) {
  const copy = kinds[kind];
  const { data: settings, isLoading } = useBillingSettingsQuery();
  const template = settings ? copy.read(settings) : undefined;
  const save = useSaveEmailTemplate(kind);

  // Null until something is typed, so what is stored shows through without an effect copying
  // it into state — and an empty field stays empty, because empty is what means "use the
  // built-in wording" rather than "not loaded yet".
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const subject = draft?.subject ?? template?.subject ?? "";
  const body = draft?.body ?? template?.body ?? "";

  const [confirmReset, setConfirmReset] = useState(false);

  // Clicking a token has to know where the caret was, and the element is the only thing that
  // still knows after a click lands somewhere else.
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [target, setTarget] = useState<Target>("body");

  // The preview is a request, so it follows the typing at a distance rather than per keystroke.
  const debouncedSubject = useDebouncedValue(subject, 400);
  const debouncedBody = useDebouncedValue(body, 400);
  const { data: preview } = useEmailPreviewQuery(
    kind,
    debouncedSubject,
    debouncedBody,
    settings != null,
  );

  function setField(which: Target, value: string) {
    setDraft({ subject, body, [which]: value });
  }

  /**
   * Drops {{champ}} where the caret is in the field last touched.
   *
   * The chips cancel their own mousedown, so focus never leaves the field and the selection is
   * still live when this runs; the ref is read anyway because a click with a mouse button held
   * elsewhere can still have moved it.
   */
  function insertField(field: string) {
    const token = `{{${field}}}`;
    const element = target === "subject" ? subjectRef.current : bodyRef.current;
    const current = target === "subject" ? subject : body;

    const start = element?.selectionStart ?? current.length;
    const end = element?.selectionEnd ?? current.length;
    setField(target, current.slice(0, start) + token + current.slice(end));

    // After the value React writes back, so a second click lands after the first token instead
    // of at the start of the field.
    const caret = start + token.length;
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(caret, caret);
    });
  }

  function resetToDefault() {
    if (!template) return;
    setDraft({ subject: template.defaultSubject, body: template.defaultBody });
    setConfirmReset(false);
  }

  async function onSave() {
    try {
      await save.mutateAsync({ subject, body });
      toast.success(copy.saved);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer ce modèle.");
    }
  }

  if (isLoading || !template) return <Skeleton className="h-96 max-w-5xl" />;

  return (
    <Card className="max-w-5xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="size-4" />
          {copy.title}
        </CardTitle>
        <CardDescription>
          {copy.description} Les champs entre accolades sont remplacés par les valeurs de{" "}
          {copy.document} au moment de l&apos;envoi.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <Field>
            <FieldLabel htmlFor={`${kind}-email-subject`}>Sujet</FieldLabel>
            <Input
              ref={subjectRef}
              id={`${kind}-email-subject`}
              value={subject}
              onChange={(event) => setField("subject", event.target.value)}
              onFocus={() => setTarget("subject")}
              placeholder={template.defaultSubject}
            />
            <FieldDescription>
              Facultatif : laissé vide, le sujet intégré est utilisé.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${kind}-email-body`}>Message</FieldLabel>
            <Textarea
              ref={bodyRef}
              id={`${kind}-email-body`}
              value={body}
              onChange={(event) => setField("body", event.target.value)}
              onFocus={() => setTarget("body")}
              rows={12}
              className="min-h-56 font-mono text-xs md:text-xs"
            />
            <FieldDescription>
              Facultatif : laissé vide, le message intégré est utilisé. Le courriel part en HTML,
              donc un paragraphe s&apos;écrit <code>&lt;p&gt;…&lt;/p&gt;</code> ; un simple saut de
              ligne suffit aussi, il est conservé tel quel.
            </FieldDescription>
          </Field>

          <div>
            <p className="text-sm font-medium text-foreground">Champs disponibles</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cliquez un champ pour l&apos;insérer à l&apos;endroit du curseur, dans le dernier
              champ touché ({target === "subject" ? "le sujet" : "le message"}).
            </p>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {template.fields.map((item) => (
                <li key={item.field}>
                  <button
                    type="button"
                    // Keeps the caret where it is: without this, the mousedown moves focus out
                    // of the field before the insertion knows where to go.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertField(item.field)}
                    title={item.description}
                    className="flex w-full flex-col gap-0.5 rounded-lg border border-border px-2.5 py-1.5 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <code className="text-xs text-foreground">{`{{${item.field}}}`}</code>
                    <span className="text-xs text-muted-foreground">{item.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          <p className="text-sm font-medium text-foreground">Aperçu</p>
          <p className="text-sm text-muted-foreground">
            Rendu par le même code que l&apos;envoi, avec {copy.sample}.
          </p>

          <div className="rounded-lg border border-border">
            <div className="border-b border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Sujet</p>
              <p className="text-sm font-medium break-words text-foreground">
                {preview ? preview.subject : "…"}
              </p>
            </div>
            {preview ? (
              /*
               * The HTML comes from our own API, which renders the template and escapes every
               * value it fills in — this is the one reason the string can be injected here. A
               * body assembled in the browser, or coming from anywhere else, must not be.
               */
              <div
                className="px-3 py-2 text-sm break-words text-foreground [&_a]:underline [&_p]:my-2 [&_strong]:font-medium"
                dangerouslySetInnerHTML={{ __html: preview.body }}
              />
            ) : (
              <div className="space-y-2 px-3 py-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="gap-2">
        <Button onClick={onSave} disabled={save.isPending}>
          {save.isPending && <Spinner />}
          Enregistrer
        </Button>
        <Button variant="outline" onClick={() => setConfirmReset(true)}>
          <RotateCcw className="size-4" />
          Reprendre le modèle par défaut
        </Button>
      </CardFooter>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reprendre le modèle par défaut ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le sujet et le message que vous avez écrits seront remplacés par le texte intégré de
              Vexta. Rien n&apos;est enregistré avant que vous ne cliquiez « Enregistrer ».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                resetToDefault();
              }}
            >
              Remplacer les deux champs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
