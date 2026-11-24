"use client";

import { useState } from "react";
import { Images, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClickableCard } from "@/components/layout/clickable-card";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { GallerySheet } from "@/components/company/gallery-sheet";
import {
  useCreateGallery,
  useDeleteGallery,
  useGalleriesQuery,
  useUpdateGallery,
} from "@/hooks/use-galleries";
import { ApiError } from "@/lib/api";
import { ex } from "@/lib/placeholders";
import type { Gallery } from "@/lib/types";

/**
 * The company's galleries: named sets of photographs it keeps to show.
 *
 * Pattern: List / Index, as cards rather than rows, because what is being scanned is
 * photographs. Opening one opens its contents; renaming and deleting stay on the card, where
 * the thing being renamed is in view.
 *
 * Named sets rather than photographs hung straight on the page, because the point of naming
 * them is reuse: a roofer builds "Toitures 2026" once and places it wherever it belongs.
 */
export function GalleriesSection({ canEdit }: { canEdit: boolean }) {
  const { data, isLoading, isError, error, refetch } = useGalleriesQuery();
  const create = useCreateGallery();
  const update = useUpdateGallery();
  const remove = useDeleteGallery();

  const [editing, setEditing] = useState<Gallery | null | undefined>(undefined);
  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const [deleting, setDeleting] = useState<Gallery | undefined>(undefined);

  const galleries = data ?? [];

  const createButton = canEdit ? (
    <Button onClick={() => setEditing(null)}>
      <Plus />
      Nouvelle galerie
    </Button>
  ) : undefined;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Galeries</h2>
          <p className="text-sm text-muted-foreground">
            Vos photos, rangées par série, prêtes à être placées sur votre page.
          </p>
        </div>
        {createButton}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-48 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Galeries indisponibles"
          fallback="Les galeries n'ont pas pu être chargées."
          onRetry={() => void refetch()}
        />
      ) : galleries.length === 0 ? (
        <EmptyState
          icon={Images}
          title="Aucune galerie"
          description="Une galerie est une série de photos que vous nommez une fois et placez où vous voulez : réalisations, avant-après, un chantier en particulier."
          action={createButton}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {galleries.map((gallery) => (
            <li key={gallery.id}>
              <ClickableCard
                className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card"
                label={`Ouvrir la galerie ${gallery.name}`}
                onOpen={() => setOpenId(gallery.id)}
              >
                {/* A fixed frame whether or not there is a cover, so a row of mixed galleries
                    does not stagger. */}
                <div className="flex aspect-[4/3] items-center justify-center bg-muted/40">
                  {gallery.coverUrl ? (
                    /* Not next/image: the link is signed, short-lived and already unique. */
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={gallery.coverUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <Images className="size-8 text-muted-foreground" aria-hidden="true" />
                  )}
                </div>

                <div className="flex flex-1 flex-col p-3">
                  <p className="font-medium text-foreground">{gallery.name}</p>
                  {gallery.description && (
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                      {gallery.description}
                    </p>
                  )}

                  <div className="mt-auto flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground">
                      {gallery.imageCount === 1 ? "1 photo" : `${gallery.imageCount} photos`}
                    </span>

                    {canEdit && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Renommer ${gallery.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditing(gallery);
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Supprimer ${gallery.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleting(gallery);
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </ClickableCard>
            </li>
          ))}
        </ul>
      )}

      {editing !== undefined && (
        <GalleryDialog
          gallery={editing}
          pending={create.isPending || update.isPending}
          onClose={() => setEditing(undefined)}
          onSave={async (values) => {
            try {
              if (editing) await update.mutateAsync({ id: editing.id, values });
              else {
                const created = await create.mutateAsync(values);
                // Straight into it: somebody who just named a gallery came to put photographs
                // in it, and a card they have to find and press again is a step for nothing.
                setOpenId(created.gallery.id);
              }

              setEditing(undefined);
              toast.success(editing ? "Galerie enregistrée." : "Galerie créée.");
            } catch (failure) {
              toast.error(
                failure instanceof ApiError
                  ? failure.message
                  : "Impossible d'enregistrer cette galerie.",
              );
            }
          }}
        />
      )}

      {openId && (
        <GallerySheet
          open={Boolean(openId)}
          onOpenChange={(next) => !next && setOpenId(undefined)}
          galleryId={openId}
        />
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => !next && setDeleting(undefined)}
        title={`Supprimer « ${deleting?.name ?? ""} » ?`}
        description="Les photos restent dans votre bibliothèque. Une section de votre page qui montrait cette galerie cessera simplement d'être affichée."
        pending={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;

          try {
            await remove.mutateAsync(deleting.id);
            toast.success("Galerie supprimée.");
          } catch (failure) {
            toast.error(
              failure instanceof ApiError ? failure.message : "Impossible de supprimer cette galerie.",
            );
          } finally {
            setDeleting(undefined);
          }
        }}
      />
    </div>
  );
}

/**
 * A gallery's name and its line of description. A dialog rather than a sheet: two fields do not
 * need a panel the height of the window.
 */
function GalleryDialog({
  gallery,
  pending,
  onClose,
  onSave,
}: {
  gallery: Gallery | null;
  pending: boolean;
  onClose: () => void;
  onSave: (values: { name: string; description: string | null; sortOrder: number }) => void;
}) {
  const [name, setName] = useState(gallery?.name ?? "");
  const [description, setDescription] = useState(gallery?.description ?? "");
  const [touched, setTouched] = useState(false);

  const invalid = touched && name.trim().length === 0;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{gallery ? "Modifier la galerie" : "Nouvelle galerie"}</DialogTitle>
          <DialogDescription>
            {gallery
              ? "Son nom et sa description. Les photos se modifient en l'ouvrant."
              : "Donnez-lui un nom. Vous ajouterez les photos juste après."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-4">
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor="gallery-name">Nom</FieldLabel>
            <Input
              id="gallery-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={ex("Toitures 2026")}
              aria-invalid={invalid}
            />
            {invalid && <FieldError errors={[{ message: "La galerie a besoin d'un nom." }]} />}
          </Field>

          <Field>
            <FieldLabel htmlFor="gallery-description">Description</FieldLabel>
            <Textarea
              id="gallery-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={ex("Bardeau et membrane, secteur Québec.")}
            />
            <FieldDescription>Lue sous le titre, partout où la galerie est placée.</FieldDescription>
          </Field>
        </div>

        <DialogFooter>
          <Button
            type="button"
            disabled={pending || name.trim().length === 0}
            onClick={() =>
              onSave({
                name: name.trim(),
                description: description.trim() || null,
                sortOrder: gallery?.sortOrder ?? 0,
              })
            }
          >
            {pending && <Spinner />}
            {gallery ? "Enregistrer" : "Créer la galerie"}
          </Button>
          <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
