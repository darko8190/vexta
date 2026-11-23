"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPen, MoreHorizontal, Pencil, PenLine, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { FillFormSheet } from "@/components/forms/fill-form-sheet";
import { FormTemplateSheet } from "@/components/forms/form-template-sheet";
import { useCanManage } from "@/hooks/use-can-create";
import { useDeleteForm, useFormsQuery } from "@/hooks/use-forms";
import { ApiError } from "@/lib/api";
import type { FormTemplate } from "@/lib/types";

/**
 * The company's own forms.
 *
 * Two audiences on one list, which is why each row has two actions. A crew member opens one to
 * fill it; whoever runs the company opens its page to change what it asks and what it sets off.
 * A draft is only on this list for the second of the two — it is not offered to be filled.
 */
export function FormsSection() {
  const router = useRouter();
  const canManage = useCanManage();
  const { data, isLoading, isError, error, refetch } = useFormsQuery();
  const remove = useDeleteForm();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FormTemplate | undefined>(undefined);
  const [filling, setFilling] = useState<FormTemplate | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<FormTemplate | undefined>(undefined);

  const forms = data ?? [];

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Formulaire supprimé.");
      setDeleteTarget(undefined);
    } catch (error) {
      // The API refuses a form that has been filled and says so with the count: the answers are
      // a record of what a crew reported, and the way to retire a form is to unpublish it.
      toast.error(
        error instanceof ApiError ? error.message : "Impossible de supprimer ce formulaire.",
      );
    }
  }

  const createButton = canManage ? (
    <Button onClick={openCreate}>
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
          {forms.map((template) => (
            <div
              key={template.id}
              className="flex flex-wrap items-start gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{template.title}</span>
                  {template.isPublished ? (
                    <Badge variant="secondary">Publié</Badge>
                  ) : (
                    <Badge variant="outline">Brouillon</Badge>
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

              <div className="flex items-center gap-2">
                {/* Only a published form can be filled, and only a published form offers it. */}
                {template.isPublished && (
                  <Button variant="outline" size="sm" onClick={() => setFilling(template)}>
                    <PenLine />
                    Remplir
                  </Button>
                )}

                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions sur ${template.title}`}
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => router.push(`/outils/formulaires/${template.id}`)}
                      >
                        <PenLine />
                        Questions et actions
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setEditing(template);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil />
                        Modifier la fiche
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleteTarget(template)}
                      >
                        <Trash2 />
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <FormTemplateSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        template={editing}
        onCreated={(id) => router.push(`/outils/formulaires/${id}`)}
      />

      {filling && (
        <FillFormSheet
          open={Boolean(filling)}
          onOpenChange={(next) => !next && setFilling(undefined)}
          formId={filling.id}
        />
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => !next && setDeleteTarget(undefined)}
        title="Supprimer ce formulaire ?"
        description={
          deleteTarget
            ? `« ${deleteTarget.title} » et ses questions seront supprimés. Si des réponses y sont rattachées, dépubliez-le plutôt : les réponses sont le compte rendu de ce qui a été observé.`
            : ""
        }
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
