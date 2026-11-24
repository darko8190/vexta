"use client";

import { useState } from "react";
import { ExternalLink, FileText, MoreHorizontal, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { DocumentFormSheet } from "@/components/projects/detail/document-form-sheet";
import { formatFileSize } from "@/components/projects/detail/document-file-size";
import { NoteThread } from "@/components/projects/detail/note-thread";
import { useDeleteProjectDocument, useProjectDocumentsQuery } from "@/hooks/use-project-files";
import { useIsClientUser } from "@/hooks/use-can-create";
import { ApiError } from "@/lib/api";
import { formatDateOnly } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ProjectDocument } from "@/lib/types";
import { rowOpenClassName, rowOpenProps } from "@/components/layout/row-open";

/**
 * One tab, two halves: the job's files, then the thread written about it.
 *
 * They share a tab because that is how they are used — somebody opens this to find out what was
 * agreed and what paper backs it — and they are kept visibly apart because the audience is not
 * the same. The files are the customer's own paperwork and they can read them; the notes are
 * the company's, and the API refuses them outright to a client account.
 */
export function ProjectDocumentsSection({ projectId }: { projectId: string }) {
  // A customer reads the files and nothing else here: no filing, no thread. The API says the
  // same thing twice over — [StaffOnly] on the writes, and on the notes entirely — and this
  // keeps the interface from offering a button and a half-page that would both be refused.
  const isClient = useIsClientUser();
  // A failed read is not a job with no paperwork, and the empty copy here promises the files
  // will "appear as soon as the company uploads them" — said to a customer whose plans and
  // permits are already filed, that is a lie the request invented. The failure says so instead.
  // And `isError` alone is too wide: a failed background refetch keeps it true over rows
  // that are still right, so the panel only wins with nothing read at all (`!data`) or rows
  // left over from another query key (`isPlaceholderData`).
  const {
    data,
    isLoading,
    isError,
    isPlaceholderData,
    error: loadError,
    refetch,
  } = useProjectDocumentsQuery(projectId);
  const remove = useDeleteProjectDocument(projectId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectDocument | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ProjectDocument | undefined>(undefined);

  const documents = data ?? [];

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Document retiré.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de retirer ce document.");
    }
  }

  const addButton = (
    <Button onClick={openCreate}>
      <Upload />
      Nouveau document
    </Button>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Documents</h3>
          <p className="text-sm text-muted-foreground">
            Les plans, les permis, la soumission signée, les photos de fin de travaux.
          </p>
        </div>
        {!isClient && addButton}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        <LoadErrorState
          error={loadError}
          title="Documents indisponibles"
          fallback="Les documents de ce projet n'ont pas pu être chargés."
          onRetry={() => refetch()}
        />
      ) : documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucun document"
          description={
            isClient
              ? "Les plans et les permis de votre projet apparaîtront ici dès que l'entreprise les déposera."
              : "Déposez ici ce qui appartient au chantier. Le stockage des fichiers doit être configuré par l'administrateur de la plateforme."
          }
          action={isClient ? undefined : addButton}
        />
      ) : (
        <ul className="space-y-2">
          {documents.map((document) => (
            <li
              key={document.id}
              {...rowOpenProps(() => { setEditing(document); setFormOpen(true); }, "Ouvrir la fiche")}
              className={cn("flex items-start gap-3 rounded-lg border border-border bg-card p-3", rowOpenClassName)}
            >
              <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{document.title}</span>
                  {document.category && <Badge variant="secondary">{document.category}</Badge>}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {document.fileName} · {formatFileSize(document.sizeBytes)} ·{" "}
                  {document.uploadedByName ?? "Utilisateur retiré"} ·{" "}
                  {formatDateOnly(document.createdAt)}
                </p>
              </div>

              {document.url ? (
                /* A plain anchor, not next/link: the URL is signed, short-lived and on another
                   origin, so there is nothing for the router to prefetch. */
                <a
                  href={document.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Ouvrir ${document.title}`}
                  className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
                >
                  <ExternalLink />
                </a>
              ) : (
                // The link could not be signed, which in practice means the file storage has
                // never been configured. Said when someone reaches for the file, rather than as
                // a banner over a list that is otherwise correct.
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Ouvrir ${document.title}`}
                  onClick={() =>
                    toast.error(
                      "Le stockage des fichiers n'est pas configuré. Contactez l'administrateur de la plateforme.",
                    )
                  }
                >
                  <ExternalLink />
                </Button>
              )}

              {!isClient && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Actions pour ${document.title}`}
                      />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setEditing(document);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil />
                      Modifier
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDeleteTarget(document)}
                    >
                      <Trash2 />
                      Retirer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      )}

      {!isClient && (
        <>
          {/* The line is the whole point: one tab, but what follows it is the company's own. */}
          <Separator className="my-8" />
          <NoteThread projectId={projectId} />
        </>
      )}

      {!isClient && (
        <DocumentFormSheet
          open={formOpen}
          onOpenChange={setFormOpen}
          projectId={projectId}
          document={editing}
        />
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Retirer ce document ?"
        description={`« ${deleteTarget?.title} » quittera le projet. Le fichier reste dans votre bibliothèque.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
