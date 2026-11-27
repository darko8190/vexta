"use client";

import { useState } from "react";
import { Bug, ImageIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PageHeader } from "@/components/layout/page-header";
import { StatusPills } from "@/components/layout/status-pills";
import { FeedbackKindLabel, FeedbackStatusBadge } from "@/components/feedback/feedback-status-badge";
import {
  feedbackStatuses,
  feedbackStatusLabel,
  useDeleteFeedback,
  useMyFeedbackQuery,
  type FeedbackRequest,
  type FeedbackStatus,
} from "@/hooks/use-feedback";
import { ApiError } from "@/lib/api";
import { formatMoment } from "@/lib/dates";

/**
 * Pattern 1 — List / Index.
 *
 * The bugs and suggestions this person sent with the bug button, where each one stands and what
 * Vexta answered. One still « Envoyée » can be taken back.
 */
export default function MyFeedbackPage() {
  const { data, isLoading, isError, refetch } = useMyFeedbackQuery();
  const remove = useDeleteFeedback();
  const [status, setStatus] = useState<FeedbackStatus | "">("");
  const [deleting, setDeleting] = useState<FeedbackRequest | null>(null);

  const counts = feedbackStatuses.map((s) => ({ status: s, count: (data ?? []).filter((r) => r.status === s).length }));
  const rows = (data ?? []).filter((r) => !status || r.status === status);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Mes demandes"
        description="Les bogues et les améliorations que vous avez envoyés à l'équipe Vexta, avec leur état et notre réponse."
      />

      {data && data.length > 0 && (
        <StatusPills
          options={feedbackStatuses.map((s) => ({ value: s, label: feedbackStatusLabel(s) }))}
          value={status}
          onChange={setStatus}
          counts={counts}
          allLabel="Toutes"
        />
      )}

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : isError ? (
        <LoadErrorState onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Bug}
          title={status ? "Aucune demande dans cet état" : "Aucune demande envoyée"}
          description="Pour signaler un bogue ou proposer une amélioration, utilisez l'icône d'insecte en haut de l'écran."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden w-36 md:table-cell">Envoyée le</TableHead>
                <TableHead className="w-32">Type</TableHead>
                <TableHead>Demande</TableHead>
                <TableHead className="w-36">État</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="align-top">
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {formatMoment(row.createdAt)}
                  </TableCell>
                  <TableCell>
                    <FeedbackKindLabel kind={row.kind} />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <p className="line-clamp-3 text-sm whitespace-pre-line text-foreground" title={row.message}>
                      {row.message}
                    </p>
                    {row.hasScreenshot && (
                      <a
                        href={`/api/proxy/feedback/${row.id}/capture`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ImageIcon className="size-3.5" />
                        Voir la capture
                      </a>
                    )}
                    {row.response && (
                      <div className="mt-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
                        <p className="text-xs font-medium text-muted-foreground">
                          Réponse de l&apos;équipe Vexta
                          {row.respondedAt && ` · ${formatMoment(row.respondedAt)}`}
                        </p>
                        <p className="mt-0.5 whitespace-pre-line text-foreground">{row.response}</p>
                      </div>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground md:hidden">{formatMoment(row.createdAt)}</p>
                  </TableCell>
                  <TableCell>
                    <FeedbackStatusBadge status={row.status} kind={row.kind} />
                  </TableCell>
                  <TableCell>
                    {row.status === "Sent" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        aria-label="Supprimer la demande"
                        title="Supprimer la demande"
                        onClick={() => setDeleting(row)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Supprimer cette demande ?"
        description="Elle ne sera plus suivie par l'équipe Vexta. Cette action ne peut pas être annulée."
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success("La demande est supprimée.");
              setDeleting(null);
            },
            onError: (error) => {
              toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer cette demande.");
              setDeleting(null);
            },
          })
        }
        pending={remove.isPending}
      />
    </div>
  );
}
