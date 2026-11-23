"use client";

import { useState } from "react";
import Link from "next/link";
import { Inbox, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import {
  useDeleteFormSubmission,
  useFormSubmissionQuery,
  useFormSubmissionsQuery,
} from "@/hooks/use-forms";
import { useIsOwner } from "@/hooks/use-can-create";
import { ApiError } from "@/lib/api";
import { formatMoment } from "@/lib/dates";
import type { FormSubmission } from "@/lib/types";

/**
 * The filled copies, newest first, each one openable.
 *
 * The answers carry their own copy of the question they answered, so a reply read next spring
 * still says what was asked last autumn — even if the form has been rewritten twice since.
 */
export function FormSubmissionsSection({ formId }: { formId: string }) {
  const isOwner = useIsOwner();
  const { data, isLoading, isError, error, refetch } = useFormSubmissionsQuery(formId);
  const remove = useDeleteFormSubmission(formId);

  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<FormSubmission | undefined>(undefined);

  const submissions = data ?? [];

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Réponse supprimée.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer cette réponse.");
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Réponses</h2>
        <p className="text-sm text-muted-foreground">
          Chaque copie remplie, et ce que ses actions ont fait.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Réponses indisponibles"
          fallback="Les réponses n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : submissions.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Aucune réponse"
          description="Dès qu'un employé remplira ce formulaire, sa copie apparaîtra ici."
        />
      ) : (
        <div className="space-y-2">
          {submissions.map((submission) => (
            <div key={submission.id} className="rounded-lg border border-border bg-card">
              <div className="flex flex-wrap items-start gap-3 p-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left outline-none"
                  onClick={() =>
                    setOpenId((current) => (current === submission.id ? undefined : submission.id))
                  }
                  aria-expanded={openId === submission.id}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">
                      {submission.submittedByName ?? "Anonyme"}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatMoment(submission.createdAt)}
                    </span>
                    <Badge variant="secondary">
                      {submission.answerCount === 1
                        ? "1 réponse"
                        : `${submission.answerCount} réponses`}
                    </Badge>
                  </div>

                  {submission.actionLog && (
                    <p className="mt-1 text-xs text-muted-foreground">{submission.actionLog}</p>
                  )}
                </button>

                <div className="flex items-center gap-2">
                  {submission.createdClientId && (
                    <Link
                      href={`/clients/${submission.createdClientId}`}
                      className="text-sm text-foreground underline-offset-4 hover:underline"
                    >
                      {submission.createdClientName ?? "Client créé"}
                    </Link>
                  )}
                  {isOwner && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Supprimer cette réponse"
                      onClick={() => setDeleteTarget(submission)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </div>

              {openId === submission.id && (
                <AnswerList formId={formId} submissionId={submission.id} />
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => !next && setDeleteTarget(undefined)}
        title="Supprimer cette réponse ?"
        description="Les réponses seront effacées. Le client qu'elle a créé, s'il y en a un, reste en place."
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}

/** One reply, opened: the questions as they were asked, with what was answered. */
function AnswerList({ formId, submissionId }: { formId: string; submissionId: string }) {
  const { data, isLoading } = useFormSubmissionQuery(formId, submissionId);

  if (isLoading) {
    return (
      <div className="border-t border-border p-3">
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <dl className="grid gap-3 border-t border-border p-3 text-sm sm:grid-cols-2">
      {data.answers.map((answer) => (
        <div key={answer.id}>
          <dt className="text-muted-foreground">{answer.label}</dt>
          <dd className="whitespace-pre-wrap text-foreground">{answer.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
