"use client";

import { useEffect } from "react";
import { CheckCircle2, ClipboardPen } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { AnswerField } from "@/components/forms/fill-form-sheet";
import { SignInToFill } from "@/components/public/public-account-bar";
import { usePublicFormFill } from "@/components/public/use-public-form";
import { useAuth } from "@/lib/auth-context";
import type { PublicForm, PublicPageForm } from "@/lib/types";

/**
 * One form the owner chose for a column, its questions printed right there.
 *
 * The same gate and the same sending as the dialog on the page's list of forms; only where the
 * questions sit differs. In the builder (`preview`) nothing is fetched: an unpublished page has
 * no public route to fetch from, and the owner is arranging, not filling.
 */
export function PublicFormInline({
  slug,
  form,
  className,
  preview = false,
}: {
  slug: string;
  form: PublicPageForm;
  className?: string;
  preview?: boolean;
}) {
  const { user, loading: authLoading } = useAuth();
  const fill = usePublicFormFill<PublicForm>(
    `/api/public/formulaires/${encodeURIComponent(slug)}/${encodeURIComponent(form.id)}`,
    (payload) => payload,
  );
  const { fields, answers, loading, sending, error, done } = fill;
  const mustSignIn = fill.requiresIdentification && !authLoading && !user;

  useEffect(() => {
    if (!preview) void fill.load();
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  return (
    <div className={className} id={`formulaire-${form.id}`}>
      <h3 className="flex items-center gap-2 text-base font-medium text-foreground">
        <ClipboardPen className="size-4 shrink-0" aria-hidden="true" />
        {form.title}
      </h3>
      {form.description && (
        <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{form.description}</p>
      )}

      <div className="mt-4">
        {preview ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Les questions de ce formulaire s&apos;affichent ici sur votre page publiée.
          </p>
        ) : done ? (
          <Alert>
            <CheckCircle2 />
            <AlertDescription>{done}</AlertDescription>
          </Alert>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Un instant…</p>
        ) : mustSignIn ? (
          <SignInToFill back={`/e/${encodeURIComponent(slug)}`} />
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

            {fields && fields.length > 0 && (
              <div>
                <Button type="button" onClick={() => void fill.send()} disabled={sending}>
                  {sending && <Spinner />}
                  Envoyer
                </Button>
              </div>
            )}
          </FieldGroup>
        )}
      </div>
    </div>
  );
}
