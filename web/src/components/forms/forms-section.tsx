"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPen, Globe, PenLine, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClickableCard } from "@/components/layout/clickable-card";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { FillFormSheet } from "@/components/forms/fill-form-sheet";
import { FormTemplateSheet } from "@/components/forms/form-template-sheet";
import { useCanManage } from "@/hooks/use-can-create";
import { useFormsQuery } from "@/hooks/use-forms";
import { formKindLabels } from "@/lib/labels";
import type { FormTemplate } from "@/lib/types";

/**
 * The company's own forms.
 *
 * Two audiences on one list. A crew member presses Remplir; whoever runs the company presses the
 * card itself and lands on the form's own page, where its details, its questions, its actions and
 * its replies are. A draft is only on this list for the second of the two — it is not offered to
 * be filled.
 */
export function FormsSection() {
  const router = useRouter();
  const canManage = useCanManage();
  const { data, isLoading, isError, error, refetch } = useFormsQuery();

  const [formOpen, setFormOpen] = useState(false);
  const [filling, setFilling] = useState<FormTemplate | undefined>(undefined);

  const forms = data ?? [];

  const createButton = canManage ? (
    <Button onClick={() => setFormOpen(true)}>
      <Plus />
      Nouveau formulaire
    </Button>
  ) : undefined;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Formulaires</h2>
          <p className="text-sm text-muted-foreground">
            Vos questions, et ce que les réponses déclenchent.
          </p>
        </div>
        {createButton}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Formulaires indisponibles"
          fallback="Les formulaires n'ont pas pu être chargés."
          onRetry={() => refetch()}
        />
      ) : forms.length === 0 ? (
        <EmptyState
          icon={ClipboardPen}
          title="Aucun formulaire"
          description="Montez le vôtre : les questions, le type de réponse attendu, et ce qui arrive quand il est rempli — un courriel au bureau, un client créé."
          action={createButton}
        />
      ) : (
        <div className="space-y-2">
          {forms.map((template) => {
            const card = (
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{template.title}</span>
                  {/* The kind first: it is what the form is, and it is what somebody scanning
                      forty rows is looking for. Not shown for a plain one — "Formulaire" on a
                      list of formulaires is a word that earns nothing. */}
                  {template.kind !== "Defaut" && (
                    <Badge variant="outline">{formKindLabels[template.kind]}</Badge>
                  )}
                  {template.isPublished ? (
                    <Badge variant="secondary">Publié</Badge>
                  ) : (
                    <Badge variant="outline">Brouillon</Badge>
                  )}
                  {/* Only when it is actually reachable. A form ticked for the page but still a
                      draft is not on the internet, and a badge saying it is would be a lie
                      about who can read the answers. */}
                  {template.showOnPublicPage && template.isPublished && (
                    <Badge variant="secondary">
                      <Globe className="size-3" />
                      Page publique
                    </Badge>
                  )}
                </div>

                {template.description && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                    {template.description}
                  </p>
                )}

                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {template.fieldCount === 1 ? "1 question" : `${template.fieldCount} questions`}
                  </span>
                  <span>
                    {template.actionCount === 0
                      ? "Aucune action"
                      : template.actionCount === 1
                        ? "1 action"
                        : `${template.actionCount} actions`}
                  </span>
                  <span>
                    {template.submissionCount === 1
                      ? "1 réponse"
                      : `${template.submissionCount} réponses`}
                  </span>
                </div>
              </div>
            );

            const fill = template.isPublished ? (
              <Button variant="outline" size="sm" onClick={() => setFilling(template)}>
                <PenLine />
                Remplir
              </Button>
            ) : null;

            const shell = "flex flex-wrap items-start gap-3 rounded-lg border border-border bg-card p-3";

            // The card opens the form's page for whoever could have used the actions menu that
            // used to sit here. For a crew member it stays a plain card: what they came to do is
            // fill it, and the button for that is right there.
            return canManage ? (
              <ClickableCard
                key={template.id}
                className={shell}
                label={`Ouvrir le formulaire ${template.title}`}
                onOpen={() => router.push(`/outils/formulaires/${template.id}`)}
              >
                {card}
                <div className="flex items-center gap-2">{fill}</div>
              </ClickableCard>
            ) : (
              <div key={template.id} className={shell}>
                {card}
                <div className="flex items-center gap-2">{fill}</div>
              </div>
            );
          })}
        </div>
      )}

      <FormTemplateSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreated={(id) => router.push(`/outils/formulaires/${id}`)}
      />

      {filling && (
        <FillFormSheet
          open={Boolean(filling)}
          onOpenChange={(next) => !next && setFilling(undefined)}
          formId={filling.id}
        />
      )}

    </div>
  );
}
