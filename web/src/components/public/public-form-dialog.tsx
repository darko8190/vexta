"use client";

import { useEffect, useState } from "react";
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
import { usePublicFormFill } from "@/components/public/use-public-form";
import type { PublicForm, PublicPageForm } from "@/lib/types";

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
  const { user, loading: authLoading } = useAuth();
  const fill = usePublicFormFill<PublicForm>(
    `/api/public/formulaires/${encodeURIComponent(slug)}/${encodeURIComponent(form.id)}`,
    (payload) => payload,
  );
  const { fields, answers, loading, sending, error, done } = fill;

  // Asked before any question is shown: filling a whole form and only then being told to sign
  // in loses the answers on the way to the sign-in page.
  const mustSignIn = fill.requiresIdentification && !authLoading && !user;

  // An old shared link (/e/{slug}?formulaire={id}) opens this form straight away. Read once, on
  // the client: the page itself is prerendered and does not know its query string.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("formulaire") !== form.id) return;
    document.getElementById(`formulaire-${form.id}`)?.scrollIntoView({ block: "center" });
    void onOpenChange(true);
    // Only on arrival: reopening on every render would trap the visitor in the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) await fill.load();
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
              <SignInToFill back={`/e/${encodeURIComponent(slug)}`} />
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
                  onChange={(value) => fill.setAnswer(field.id, value)}
                  invalid={false}
                />
              ))}
            </FieldGroup>
          )}
        </div>

        <DialogFooter>
          {!done && !mustSignIn && fields && fields.length > 0 ? (
            <>
              <Button type="button" onClick={() => void fill.send()} disabled={sending}>
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
