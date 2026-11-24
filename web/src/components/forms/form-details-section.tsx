"use client";

import { Badge } from "@/components/ui/badge";
import { formatMoment } from "@/lib/dates";
import { formKindLabels } from "@/lib/labels";
import type { FormTemplate } from "@/lib/types";

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  );
}

/**
 * What was filled in when the form was created, in one place.
 *
 * The first section of the record, the same way a client's file and an employee's open on their
 * details. Before this, opening a form landed straight in its question editor — which is the
 * right place to be when you came to change a question, and the wrong one when you came to find
 * out what this form is and whether anybody can see it yet.
 */
export function FormDetailsSection({ form }: { form: FormTemplate }) {
  return (
    <div>
      {/* No Modifier here: the page header carries one, it is in view from every section, and
          two identical buttons a hand's width apart is one too many. */}
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Détails</h2>
        <p className="text-sm text-muted-foreground">
          Ce qui a été saisi à la création du formulaire.
        </p>
      </div>

      <dl className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
        <Line label="Titre">{form.title}</Line>

        <Line label="Type">{formKindLabels[form.kind]}</Line>

        <Line label="État">
          {form.isPublished ? (
            <Badge variant="secondary">Publié</Badge>
          ) : (
            <Badge variant="outline">Brouillon</Badge>
          )}
        </Line>

        {/* Said in full rather than as a tick, because the answer has three states and only one
            of them means somebody outside can fill it in. */}
        <Line label="Page publique">
          {!form.showOnPublicPage ? (
            <span className="text-muted-foreground">Non</span>
          ) : form.isPublished ? (
            "Oui"
          ) : (
            <span className="text-muted-foreground">
              Coché, mais invisible tant que le formulaire est un brouillon
            </span>
          )}
        </Line>

        <div className="min-w-0 sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Description</dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
            {form.description ?? <span className="text-muted-foreground">—</span>}
          </dd>
        </div>

        {/* Worth its own line rather than being left in the fiche: it is the only field here
            whose effect nobody sees until somebody else has filled the form in. */}
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Message de confirmation</dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
            {form.successMessage ?? (
              <span className="text-muted-foreground">
                Aucun — le message par défaut est affiché.
              </span>
            )}
          </dd>
        </div>

        <Line label="Questions">
          <span className="tabular-nums">
            {form.fieldCount === 1 ? "1 question" : `${form.fieldCount} questions`}
          </span>
        </Line>

        <Line label="Actions">
          <span className="tabular-nums">
            {form.actionCount === 0
              ? "Aucune action"
              : form.actionCount === 1
                ? "1 action"
                : `${form.actionCount} actions`}
          </span>
        </Line>

        <Line label="Réponses reçues">
          <span className="tabular-nums">
            {form.submissionCount === 1 ? "1 réponse" : `${form.submissionCount} réponses`}
          </span>
        </Line>

        <Line label="Position dans la liste">
          <span className="tabular-nums">{form.sortOrder}</span>
        </Line>

        <Line label="Dernière modification">{formatMoment(form.updatedAt)}</Line>
      </dl>
    </div>
  );
}
