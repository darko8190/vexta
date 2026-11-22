"use client";

import { useState } from "react";
import { MessageSquare, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import {
  useDeleteProjectNote,
  useProjectNotesQuery,
  useSaveProjectNote,
} from "@/hooks/use-project-files";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDateOnly } from "@/lib/dates";

const MAX_BODY_LENGTH = 4000;

/**
 * The job's internal thread: what the client asked for on site, why the crew lost two days.
 *
 * Newest first, because the entry that matters is the last one written. Still open on a billed
 * project, unlike the documents above it — the warranty call and the deficiency reported in
 * March are exactly what a closed job gets written on.
 */
export function NoteThread({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  // A failed read is not a thread nobody wrote in. Showing an unread thread as empty is worse
  // here than in a table: the box above invites a note, so somebody writes down what they were
  // told on site a second time, next to the entry they could not see.
  // And `isError` alone is too wide: a failed background refetch keeps it true over rows
  // that are still right, so the panel only wins with nothing read at all (`!data`) or rows
  // left over from another query key (`isPlaceholderData`).
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } = useProjectNotesQuery(projectId);
  const save = useSaveProjectNote(projectId);
  const remove = useDeleteProjectNote(projectId);

  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [editDraft, setEditDraft] = useState("");
  const [deleteId, setDeleteId] = useState<string | undefined>(undefined);

  const notes = data ?? [];

  // The note carries its author's name, not their id, so that is what can be compared. The API
  // is the real gate — it refuses a write on someone else's entry — and this only keeps the
  // menu from offering an action that would come back refused.
  const fullName = user ? `${user.firstName} ${user.lastName}` : null;
  const isOwner = (authorName: string | null) =>
    user?.role === "TenantAdmin" ||
    user?.role === "SuperAdmin" ||
    (authorName !== null && authorName === fullName);

  async function onAdd() {
    const body = draft.trim();
    // An empty note is a row that says nothing, and the thread is read top to bottom.
    if (!body) return;

    try {
      await save.mutateAsync({ values: { body } });
      setDraft("");
      toast.success("Note ajoutée.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'ajouter cette note.");
    }
  }

  async function onSaveEdit(id: string) {
    const body = editDraft.trim();
    if (!body) return;

    try {
      await save.mutateAsync({ id, values: { body } });
      setEditingId(undefined);
      setEditDraft("");
      toast.success("Note mise à jour.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de modifier cette note.");
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;

    try {
      await remove.mutateAsync(deleteId);
      setDeleteId(undefined);
      toast.success("Note supprimée.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer cette note.");
    }
  }

  const adding = save.isPending && editingId === undefined;

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground">Notes</h3>
        <p className="text-sm text-muted-foreground">
          Le journal interne du chantier. Le client ne le voit pas.
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-border bg-card p-3">
        <Textarea
          id="project-note-draft"
          aria-label="Ajouter une note"
          placeholder="Ajouter une note : ce qui a été demandé sur place, ce qui a été convenu…"
          rows={3}
          maxLength={MAX_BODY_LENGTH}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <Button type="button" onClick={onAdd} disabled={adding || !draft.trim()}>
            {adding && <Spinner />}
            Ajouter la note
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        <LoadErrorState
          error={loadError}
          title="Notes indisponibles"
          fallback="Les notes de ce projet n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : notes.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="Aucune note"
          description="Les appels, les changements demandés sur place, les retards : ce que la prochaine personne doit savoir avant de se déplacer."
        />
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <span className="font-medium text-foreground">
                    {note.authorName ?? "Utilisateur retiré"}
                  </span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {formatDateOnly(note.createdAt)}
                    {note.updatedAt !== note.createdAt && " · modifiée"}
                  </span>
                </div>

                {isOwner(note.authorName) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon" aria-label="Actions pour cette note" />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditingId(note.id);
                          setEditDraft(note.body);
                        }}
                      >
                        <Pencil />
                        Modifier
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => setDeleteId(note.id)}>
                        <Trash2 />
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {editingId === note.id ? (
                <div className="mt-2">
                  <Textarea
                    aria-label="Modifier la note"
                    rows={3}
                    maxLength={MAX_BODY_LENGTH}
                    value={editDraft}
                    onChange={(event) => setEditDraft(event.target.value)}
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditingId(undefined);
                        setEditDraft("");
                      }}
                    >
                      Annuler
                    </Button>
                    <Button
                      type="button"
                      onClick={() => onSaveEdit(note.id)}
                      disabled={save.isPending || !editDraft.trim()}
                    >
                      {save.isPending && <Spinner />}
                      Enregistrer
                    </Button>
                  </div>
                </div>
              ) : (
                // Kept as typed: a note is written with line breaks and reads as nonsense
                // without them.
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{note.body}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => !open && setDeleteId(undefined)}
        title="Supprimer cette note ?"
        description="Elle quittera le journal du projet. Personne ne pourra la remettre."
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
