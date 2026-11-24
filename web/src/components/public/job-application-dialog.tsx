"use client";

import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { AnswerField } from "@/components/forms/fill-form-sheet";
import type { FormField, PublicJobForm } from "@/lib/types";

/**
 * Applying for a position from the company's public page.
 *
 * The questions are fetched when the dialog opens rather than with the page: most visitors read
 * a posting and never apply, and a page carrying five forms of a dozen questions would be paid
 * for by all of them.
 *
 * Nothing is validated here beyond what the browser does for free. The server checks every
 * answer against the question -- required, a number, one of the offered choices -- and it is
 * the only check that counts, since this page can be called with anything. Showing its message
 * is honest; duplicating its rules would be a second set to keep in step.
 */
export function JobApplicationDialog({
  slug,
  jobId,
  jobTitle,
}: {
  slug: string;
  jobId: string;
  jobTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PublicJobForm | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const base = `/api/public/offres/${encodeURIComponent(slug)}/${encodeURIComponent(jobId)}`;

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;

    // Reset on every opening: somebody who sent one application and opens another posting must
    // not find the first one's answers already typed in.
    setError(null);
    setDone(null);
    setAnswers({});
    setForm(null);
    setLoading(true);

    try {
      const response = await fetch(base, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setForm((await response.json()) as PublicJobForm);
    } catch {
      setError("Le formulaire n'a pas pu être chargé. Réessayez dans un moment.");
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    if (!form) return;

    setSending(true);
    setError(null);

    try {
      const response = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: form.fields.map((field) => ({ fieldId: field.id, value: answers[field.id] ?? null })),
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.message ?? "Votre candidature n'a pas pu être envoyée.");
        return;
      }

      setDone(data?.message ?? "Merci, votre candidature est envoyée.");
    } catch {
      setError("Votre candidature n'a pas pu être envoyée. Réessayez dans un moment.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => void onOpenChange(next)}>
      <Button type="button" onClick={() => void onOpenChange(true)} className="mt-4">
        <Send className="size-4" />
        Postuler
      </Button>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{form?.formTitle ?? "Postuler"}</DialogTitle>
          <DialogDescription>
            {form?.formDescription?.trim() || jobTitle}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-4">
          {loading && (
            <p className="py-6 text-sm text-muted-foreground">Chargement du formulaire…</p>
          )}

          {done && (
            <Alert>
              <CheckCircle2 />
              <AlertDescription>{done}</AlertDescription>
            </Alert>
          )}

          {error && !done && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {form && !done && (
            <FieldGroup>
              {form.fields.map((field) => (
                <AnswerField
                  key={field.id}
                  // The public shape keeps the options as the lines they were typed as, which is
                  // what the server stores; the shared renderer wants them split.
                  field={
                    {
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
                    } satisfies FormField
                  }
                  value={answers[field.id] ?? ""}
                  onChange={(value) => setAnswers((current) => ({ ...current, [field.id]: value }))}
                  invalid={false}
                />
              ))}
            </FieldGroup>
          )}
        </div>

        <DialogFooter>
          {done ? (
            <DialogClose render={<Button type="button" />}>Fermer</DialogClose>
          ) : (
            <>
              <Button type="button" onClick={() => void send()} disabled={sending || !form}>
                {sending && <Spinner />}
                Envoyer ma candidature
              </Button>
              <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
