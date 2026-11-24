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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { AnswerField } from "@/components/forms/fill-form-sheet";
import { CompleteCvToApply, SignInToApply } from "@/components/public/public-account-bar";
import { useApplicationEligibilityQuery, useApplyToJob } from "@/hooks/use-personal-profile";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { FormField, PublicJobForm } from "@/lib/types";

/**
 * Applying for a position from a company's public page.
 *
 * Four states, and the dialog is honest about which one it is in rather than offering a button
 * that will be refused: not signed in, signed in with an unfinished CV, already applied, ready.
 * Each one says what to do next, because each one has a different next thing.
 *
 * Nothing about the CV is typed here. It was written once on Mon CV and is sent from there,
 * which is the whole reason applying needs an account: the company receives a name, a telephone
 * number and an account of what somebody has done, instead of a form it has to chase.
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
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [coverNote, setCoverNote] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, string>>({});
  const [form, setForm] = useState<PublicJobForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Asked only once the dialog is open, and only for a signed-in reader: there is nothing to
  // ask on behalf of somebody with no account.
  const eligibility = useApplicationEligibilityQuery(slug, open && user ? jobId : null);
  const apply = useApplyToJob();

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;

    setError(null);
    setDone(null);
    setCoverNote("");
    setAnswers({});
    setFiles({});
    setForm(null);

    // The questions the company attached, if any. Fetched here rather than with the page: most
    // readers of a posting never apply.
    try {
      const response = await fetch(
        `/api/public/offres/${encodeURIComponent(slug)}/${encodeURIComponent(jobId)}`,
        { cache: "no-store" },
      );
      if (response.ok) setForm((await response.json()) as PublicJobForm);
    } catch {
      // A posting with no form answers 404 here, which is not an error: it simply asks nothing
      // beyond the CV. A real failure shows up when sending, where it can be said properly.
    }
  }

  async function send() {
    setError(null);

    try {
      const result = await apply.mutateAsync({
        slug,
        jobPostingId: jobId,
        coverNote: coverNote.trim() || null,
        answers: (form?.fields ?? []).map((field) => ({
          fieldId: field.id,
          value: answers[field.id] ?? null,
          mediaAssetId: files[field.id] ?? null,
        })),
      });

      setDone(result.message);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Votre candidature n'a pas pu être envoyée.",
      );
    }
  }

  const ready = Boolean(user) && eligibility.data?.canApply && !eligibility.data.alreadyApplied;

  return (
    <Dialog open={open} onOpenChange={(next) => void onOpenChange(next)}>
      <Button type="button" onClick={() => void onOpenChange(true)} className="mt-4">
        <Send className="size-4" />
        Postuler
      </Button>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Postuler — {jobTitle}</DialogTitle>
          <DialogDescription>
            {user
              ? "Votre CV est envoyé avec votre candidature."
              : "Il faut un compte Vexta pour postuler."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-4">
          {done ? (
            <Alert>
              <CheckCircle2 />
              <AlertDescription>{done}</AlertDescription>
            </Alert>
          ) : !user ? (
            <SignInToApply slug={slug} />
          ) : eligibility.isLoading ? (
            <p className="py-4 text-sm text-muted-foreground">Un instant…</p>
          ) : eligibility.data?.alreadyApplied ? (
            <Alert>
              <CheckCircle2 />
              <AlertDescription>
                Vous avez déjà postulé à cette offre. L&apos;entreprise a votre CV.
              </AlertDescription>
            </Alert>
          ) : !eligibility.data?.canApply ? (
            <CompleteCvToApply missing={eligibility.data?.missing ?? []} />
          ) : (
            <FieldGroup>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Field>
                <FieldLabel htmlFor="apply-note">Un mot à l&apos;employeur</FieldLabel>
                <Textarea
                  id="apply-note"
                  rows={4}
                  value={coverNote}
                  onChange={(event) => setCoverNote(event.target.value)}
                />
                <FieldDescription>
                  Optionnel, et souvent la première chose qui est lue.
                </FieldDescription>
              </Field>

              {(form?.fields ?? []).map((field) => (
                <AnswerField
                  key={field.id}
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
                  onFile={(asset) => {
                    setFiles((current) => {
                      const nextFiles = { ...current };
                      if (asset) nextFiles[field.id] = asset.id;
                      else delete nextFiles[field.id];
                      return nextFiles;
                    });
                    setAnswers((current) => ({ ...current, [field.id]: asset?.fileName ?? "" }));
                  }}
                  invalid={false}
                />
              ))}
            </FieldGroup>
          )}
        </div>

        <DialogFooter>
          {ready && !done ? (
            <>
              <Button type="button" onClick={() => void send()} disabled={apply.isPending}>
                {apply.isPending && <Spinner />}
                Envoyer ma candidature
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
