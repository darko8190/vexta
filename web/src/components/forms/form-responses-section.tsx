"use client";

import { useState } from "react";
import { ClipboardList, ChevronLeft, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { FormSubmissionsSection } from "@/components/forms/form-submissions-section";
import { useFormResponsesQuery } from "@/hooks/use-forms";
import { formatMoment } from "@/lib/dates";

/**
 * The answers, grouped by the form they answer.
 *
 * Grouped rather than listed flat, because an answer means nothing without its question: "Oui"
 * is not information until you know it answered "Le chantier était-il propre au départ ?".
 *
 * Forms nobody has filled are shown too, at the bottom, reading zero. Hiding them makes a form
 * that was published and never used look like a form that was never published.
 */
export function FormResponsesSection() {
  const { data, isLoading, isError, error, refetch } = useFormResponsesQuery();

  // Which form is open. Null is the list of forms; a form chosen replaces it with that form's
  // answers, rather than expanding in place — a page of twelve expanded forms is a page nobody
  // can find anything in.
  const [openForm, setOpenForm] = useState<{ id: string; title: string } | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <LoadErrorState
        error={error}
        title="Réponses indisponibles"
        fallback="Les réponses n'ont pas pu être chargées."
        onRetry={() => refetch()}
      />
    );
  }

  const forms = data ?? [];

  if (openForm) {
    return (
      <div>
        <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={() => setOpenForm(null)}>
          <ChevronLeft />
          Tous les formulaires
        </Button>
        <FormSubmissionsSection formId={openForm.id} />
      </div>
    );
  }

  if (forms.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Aucun formulaire"
        description="Créez un formulaire dans l'onglet Formulaires : ses réponses apparaîtront ici."
      />
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Réponses</h2>
        <p className="text-sm text-muted-foreground">
          Ce qui est revenu du terrain, regroupé par formulaire.
        </p>
      </div>

      <ul className="space-y-2">
        {forms.map((form) => {
          const empty = form.submissionCount === 0;

          return (
            <li key={form.id}>
              <button
                type="button"
                disabled={empty}
                onClick={() => setOpenForm({ id: form.id, title: form.title })}
                className={
                  "flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-left " +
                  "transition-colors duration-150 motion-reduce:transition-none " +
                  "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 " +
                  (empty ? "opacity-70" : "hover:border-primary/40 hover:bg-accent/40")
                }
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{form.title}</span>
                    {!form.isPublished && <Badge variant="outline">Brouillon</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {empty
                      ? "Aucune réponse pour l'instant."
                      : `Dernière réponse ${formatMoment(form.lastSubmissionAt!)}`}
                  </p>
                </div>

                <Badge variant={empty ? "secondary" : "default"} className="shrink-0 tabular-nums">
                  {form.submissionCount}
                </Badge>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
        <ClipboardList className="size-3.5 shrink-0" />
        Les réponses gardent les questions telles qu&apos;elles étaient le jour où elles ont été
        remplies.
      </p>
    </div>
  );
}
