"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Car, ClipboardPen, Globe, Inbox, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import {
  useDeleteFormSubmission,
  useFormSubmissionQuery,
  useFormSubmissionsQuery,
} from "@/hooks/use-forms";
import { useCanManage, useIsOwner } from "@/hooks/use-can-create";
import { useQuoteFromSubmission } from "@/hooks/use-quotes";
import { useMediaLink } from "@/hooks/use-media";
import { ApiError } from "@/lib/api";
import { formatMoment } from "@/lib/dates";
import { formatQuoteNumber, type FormSubmission } from "@/lib/types";

/**
 * The filled copies, newest first, each one openable.
 *
 * The answers carry their own copy of the question they answered, so a reply read next spring
 * still says what was asked last autumn — even if the form has been rewritten twice since.
 */
export function FormSubmissionsSection({ formId }: { formId: string }) {
  const router = useRouter();
  const isOwner = useIsOwner();
  const canManage = useCanManage();
  const makeQuote = useQuoteFromSubmission();
  const { data, isLoading, isError, error, refetch } = useFormSubmissionsQuery(formId);
  const remove = useDeleteFormSubmission(formId);

  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<FormSubmission | undefined>(undefined);

  const submissions = data ?? [];

  async function onMakeQuote(submission: FormSubmission) {
    try {
      const quote = await makeQuote.mutateAsync(submission.id);
      toast.success(`Soumission ${formatQuoteNumber(quote.number)} créée, en brouillon.`);
      router.push(`/soumissions/${quote.id}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de créer la soumission.");
    }
  }

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
                    {/* Who filled it changes what the office does with it. "Rempli par Jean
                        Dubé" means one thing from the crew and quite another from a stranger on
                        the website, and nothing else on the row says which. */}
                    {submission.fromPublicPage && (
                      <Badge variant="outline">
                        <Globe className="size-3" />
                        Page publique
                      </Badge>
                    )}
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
                  {/* Named, not linked: an asset is read on its client's file, and the client
                      is already a link away when there is one. */}
                  {submission.createdClientAssetLabel && (
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Car className="size-4 shrink-0" aria-hidden="true" />
                      {submission.createdClientAssetLabel}
                    </span>
                  )}
                  {/* A request for a price is dealt with once it has its quote: the link says
                      so, and replaces the button that would make a second one. */}
                  {submission.createdQuoteId && submission.createdQuoteNumber != null ? (
                    <Link
                      href={`/soumissions/${submission.createdQuoteId}`}
                      className="inline-flex items-center gap-1.5 text-sm text-foreground underline-offset-4 hover:underline"
                    >
                      <ClipboardPen className="size-4 shrink-0" aria-hidden="true" />
                      Soumission {formatQuoteNumber(submission.createdQuoteNumber)}
                    </Link>
                  ) : (
                    submission.formKind === "Soumission" &&
                    submission.createdClientId &&
                    canManage && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={makeQuote.isPending}
                        onClick={() => onMakeQuote(submission)}
                      >
                        {makeQuote.isPending && makeQuote.variables === submission.id ? (
                          <Spinner />
                        ) : (
                          <ClipboardPen />
                        )}
                        Créer une soumission
                      </Button>
                    )
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
          <dd className="whitespace-pre-wrap text-foreground">
            {/* A file answer is its own name plus a way to open it. The name alone is still
                shown when the file has since been deleted from the library: the submission has
                to keep saying what was sent, which is why the answer survives the asset. */}
            {answer.mediaAssetId ? (
              <AnswerFileLink assetId={answer.mediaAssetId} fileName={answer.value} />
            ) : (
              answer.value ?? "—"
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Opens a file that was sent as an answer.
 *
 * The link is minted on the press rather than with the page: these URLs are signed and expire,
 * and a list of twenty submissions would be twenty signatures nobody clicked.
 */
function AnswerFileLink({ assetId, fileName }: { assetId: string; fileName: string | null }) {
  const link = useMediaLink();

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 text-primary hover:underline"
      disabled={link.isPending}
      onClick={async () => {
        try {
          const { url } = await link.mutateAsync(assetId);
          window.open(url, "_blank", "noopener,noreferrer");
        } catch {
          toast.error("Impossible d'ouvrir ce fichier.");
        }
      }}
    >
      {link.isPending ? <Spinner className="size-3.5" /> : <Paperclip className="size-3.5" />}
      {fileName ?? "Fichier"}
    </button>
  );
}
