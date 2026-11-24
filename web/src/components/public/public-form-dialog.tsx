"use client";

import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { AnswerField } from "@/components/forms/fill-form-sheet";
import { SignInToFill } from "@/components/public/public-account-bar";
import { useAuth } from "@/lib/auth-context";
import type { FormField, PublicForm, PublicPageForm } from "@/lib/types";

/**
 * Filling one of a company's forms from its public page, with no account.
 *
 * No sign-in, deliberately, unlike applying for a job. A job application is worth an account
 * because the CV is written once and sent many times; a quote request is worth nothing if the
 * person has to register first — they will telephone a competitor instead.
 *
 * What that costs is a stranger writing into a company's space, which is why the API holds a
 * ceiling on how often, refuses a form asking for a file, and marks every reply as having come
 * from the page. None of that is this component's business: it asks, it sends, it reports.
 *
 * The questions arrive when the dialog opens rather than with the page. Most visitors read a
 * page and fill nothing, and three forms of a dozen questions would otherwise be paid for by
 * every one of them.
 */
export function PublicFormDialog({ slug, form }: { slug: string; form: PublicPageForm }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [fields, setFields] = useState<FormField[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [requiresIdentification, setRequiresIdentification] = useState(false);
  const { user, loading: authLoading } = useAuth();

  // Asked before any question is shown: filling a whole form and only then being told to sign
  // in loses the answers on the way to the sign-in page.
  const mustSignIn = requiresIdentification && !authLoading && !user;

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;

    setError(null);
    setDone(null);
    setAnswers({});

    // Already in hand from a previous opening: somebody who closed the dialog to check their
    // kilometre reading should not wait for the questions a second time.
    if (fields) return;

    setLoading(true);

    try {
      const response = await fetch(
        `/api/public/formulaires/${encodeURIComponent(slug)}/${encodeURIComponent(form.id)}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        setError("Ce formulaire n'est plus disponible.");
        return;
      }

      const loaded = (await response.json()) as PublicForm;
      setRequiresIdentification(Boolean(loaded.requiresIdentification));

      // The public shape carries the options as one string per line, which is how they are
      // stored; AnswerField wants them split, like the staff shape it was written for.
      setFields(
        loaded.fields.map((field) => ({
          id: field.id,
          label: field.label,
          helpText: field.helpText,
          type: field.type,
          isRequired: field.isRequired,
          options: (field.options ?? "")
            .split("\n")
            .map((option) => option.trim())
            .filter(Boolean),
          target: "Aucun",
          sortOrder: 0,
        })),
      );
    } catch {
      setError("Le formulaire n'a pas pu être chargé. Réessayez dans un instant.");
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    setError(null);
    setSending(true);

    try {
      const response = await fetch(
        `/api/public/formulaires/${encodeURIComponent(slug)}/${encodeURIComponent(form.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: (fields ?? []).map((field) => ({
              fieldId: field.id,
              value: answers[field.id]?.trim() || null,
            })),
          }),
        },
      );

      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        // The API says which question is missing, and which ceiling was reached. Worth showing
        // as it is: "une erreur est survenue" sends somebody away, "le téléphone est
        // obligatoire" gets the form filled.
        setError(payload?.message ?? "Votre demande n'a pas pu être envoyée.");
        return;
      }

      setDone(payload?.message ?? "Merci, votre demande est envoyée.");
    } catch {
      setError("Votre demande n'a pas pu être envoyée. Réessayez dans un instant.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => void onOpenChange(next)}>
      <Button type="button" variant="outline" onClick={() => void onOpenChange(true)}>
        <Send className="size-4" />
        Remplir
      </Button>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.title}</DialogTitle>
          {form.description && <DialogDescription>{form.description}</DialogDescription>}
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-4">
          {done ? (
            <Alert>
              <CheckCircle2 />
              <AlertDescription>{done}</AlertDescription>
            </Alert>
          ) : loading ? (
            <p className="py-4 text-sm text-muted-foreground">Un instant…</p>
          ) : mustSignIn ? (
            <div className="py-2">
              <SignInToFill slug={slug} />
            </div>
          ) : (
            <FieldGroup>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {(fields ?? []).map((field) => (
                <AnswerField
                  key={field.id}
                  field={field}
                  value={answers[field.id] ?? ""}
                  onChange={(value) => setAnswers((current) => ({ ...current, [field.id]: value }))}
                  invalid={false}
                />
              ))}
            </FieldGroup>
          )}
        </div>

        <DialogFooter>
          {!done && !mustSignIn && fields && fields.length > 0 ? (
            <>
              <Button type="button" onClick={() => void send()} disabled={sending}>
                {sending && <Spinner />}
                Envoyer
              </Button>
              <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
            </>
          ) : (
            <DialogClose render={<Button type="button" variant="outline" />}>Fermer</DialogClose>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
