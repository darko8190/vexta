"use client";

import { Suspense, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Building2, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { AnswerField } from "@/components/forms/fill-form-sheet";
import { BrandTheme } from "@/components/layout/brand-theme";
import { SignInToFill } from "@/components/public/public-account-bar";
import { usePublicFormFill } from "@/components/public/use-public-form";
import { useAuth } from "@/lib/auth-context";
import type { SharedForm } from "@/lib/types";

/**
 * One form, on its own page, reached from the link a company copied or e-mailed.
 *
 * Pattern: Form — a centred card with no app chrome. It does not need the company's public page:
 * plenty of companies never publish one, and sending a single form to a client must not oblige
 * them to. The person here is usually a client or a stranger with no Vexta account, so there is
 * nothing to read but the company's name and the questions.
 */
export default function SharedFormPage() {
  // useSearchParams needs a boundary, or the route cannot be prerendered.
  return (
    <Suspense fallback={null}>
      <SharedFormContent />
    </Suspense>
  );
}

function SharedFormContent() {
  const { id } = useParams<{ id: string }>();
  // Present when the link came by e-mail: it vouches for the address it was sent to, and a
  // form that files on a client's record then needs no sign-in (see the API's FormInvitation).
  const invitation = useSearchParams().get("jeton");
  const { user, loading: authLoading } = useAuth();
  const fill = usePublicFormFill<SharedForm>(
    `/api/public/formulaire/${encodeURIComponent(id)}${invitation ? `?jeton=${encodeURIComponent(invitation)}` : ""}`,
    (payload) => payload.form,
    invitation,
  );
  const { payload, fields, answers, loading, sending, error, gone, done } = fill;

  useEffect(() => {
    void fill.load();
    // Once, on arrival: the questions do not change while somebody fills them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const mustSignIn = fill.requiresIdentification && !authLoading && !user;
  const form = payload?.form;

  return (
    <>
      <BrandTheme color={payload?.brandColor} />

      <main className="flex min-h-dvh justify-center bg-muted/30 px-4 py-10 sm:items-center">
        <div className="w-full max-w-xl">
          {/* The company's colour as a line on top: its brand on a Vexta page, without risking
              text that cannot be read on a colour nobody here chose. */}
          <div className="h-1.5 rounded-t-xl" style={{ backgroundColor: payload?.brandColor ?? "var(--primary)" }} />

          <div className="rounded-b-xl border border-t-0 border-border bg-card p-6 shadow-sm">
            {loading || (!payload && !error) ? (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            ) : gone || !payload || !form ? (
              <div className="space-y-2 py-6 text-center">
                <h1 className="text-lg font-semibold text-foreground">Formulaire introuvable</h1>
                <p className="text-sm text-muted-foreground">
                  {error ?? "Ce formulaire n'est plus disponible."} Le lien a peut-être été retiré :
                  communiquez avec l&apos;entreprise qui vous l&apos;a envoyé.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <header className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
                      {payload.logoETag ? (
                        // Not next/image: our own anonymous logo route, cache-busted by its ETag.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/company/${payload.tenantId}/logo?v=${payload.logoETag}`}
                          alt={`Logo de ${payload.companyName}`}
                          className="size-full object-contain p-1"
                        />
                      ) : (
                        <Building2 className="size-5 text-muted-foreground" aria-hidden="true" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">{payload.companyName}</p>
                  </div>

                  <div className="space-y-1">
                    <h1 className="text-xl font-semibold text-foreground">{form.title}</h1>
                    {form.description && (
                      <p className="whitespace-pre-line text-sm text-muted-foreground">{form.description}</p>
                    )}
                  </div>

                  {payload.invitedAs && !done && (
                    <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                      Vos réponses seront ajoutées au dossier de{" "}
                      <span className="font-medium text-foreground">{payload.invitedAs}</span>.
                    </p>
                  )}
                </header>

                {done ? (
                  <Alert>
                    <CheckCircle2 />
                    <AlertDescription>{done}</AlertDescription>
                  </Alert>
                ) : mustSignIn ? (
                  <SignInToFill back={`/f/${encodeURIComponent(id)}`} />
                ) : (
                  <form
                    className="space-y-6"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void fill.send();
                    }}
                  >
                    <FieldGroup>
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

                    {error && (
                      <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    <Button type="submit" disabled={sending} className="w-full sm:w-auto">
                      {sending && <Spinner />}
                      Envoyer
                    </Button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
