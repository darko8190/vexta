"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Images, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { useGalleryQuery, useSaveGalleryImages } from "@/hooks/use-galleries";
import { MAX_UPLOAD_BYTES, useUploadMedia } from "@/hooks/use-media";
import { ApiError } from "@/lib/api";
import { ex } from "@/lib/placeholders";
import type { SaveGalleryImageValues } from "@/lib/types";

/**
 * One gallery's photographs: which ones, in what order, and what each is a picture of.
 *
 * The set is saved whole on every change, like a product's images and a form's questions. That
 * is what makes removing one "save the list without it", and it is why nothing here can be half
 * done — a reorder and a caption go down together or not at all.
 *
 * The captions are the exception: they are typed, so they are kept locally and saved by the
 * button. Saving on every keystroke would be a request per letter.
 */
export function GallerySheet({
  open,
  onOpenChange,
  galleryId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  galleryId: string;
}) {
  const { data, isLoading, isError, error, refetch } = useGalleryQuery(galleryId);
  const save = useSaveGalleryImages(galleryId);
  const upload = useUploadMedia();
  const fileInput = useRef<HTMLInputElement>(null);

  // Captions being typed, by placement id. Seeded from nothing: what is not in here is what the
  // server already has, which means a background refetch cannot overwrite somebody's typing.
  const [captions, setCaptions] = useState<Record<string, string>>({});

  const images = data?.images ?? [];

  function captionOf(id: string, stored: string | null): string {
    return captions[id] ?? stored ?? "";
  }

  /** The list as it stands on screen, which is what any save has to send. */
  function current(): SaveGalleryImageValues[] {
    return images.map((image) => ({
      id: image.id,
      mediaAssetId: image.mediaAssetId,
      caption: captionOf(image.id, image.caption).trim() || null,
    }));
  }

  async function persist(next: SaveGalleryImageValues[], message: string) {
    try {
      await save.mutateAsync(next);
      setCaptions({});
      toast.success(message);
    } catch (failure) {
      toast.error(
        failure instanceof ApiError ? failure.message : "Impossible d'enregistrer la galerie.",
      );
    }
  }

  async function onPick(files: FileList) {
    const added: SaveGalleryImageValues[] = [];

    for (const file of Array.from(files)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`${file.name} dépasse la taille permise.`);
        continue;
      }

      try {
        const asset = await upload.mutateAsync(file);
        added.push({ id: null, mediaAssetId: asset.id, caption: null });
      } catch (failure) {
        toast.error(
          failure instanceof ApiError || failure instanceof Error
            ? failure.message
            : `Impossible de téléverser ${file.name}.`,
        );
      }
    }

    if (added.length === 0) return;

    await persist(
      [...current(), ...added],
      added.length === 1 ? "Photo ajoutée." : "Photos ajoutées.",
    );
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;

    const next = current();
    [next[index], next[target]] = [next[target], next[index]];
    await persist(next, "Ordre enregistré.");
  }

  const busy = upload.isPending || save.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{data?.gallery.name ?? "Galerie"}</SheetTitle>
          <SheetDescription>
            Les photos, dans l&apos;ordre où elles seront montrées.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files?.length) void onPick(event.target.files);
              event.target.value = "";
            }}
          />

          {/* Refused while the read has failed: the set is saved whole, so appending to a list
              we could not read would send the new photograph alone and erase the rest. */}
          <Button
            variant="outline"
            disabled={busy || isLoading || isError}
            onClick={() => fileInput.current?.click()}
          >
            {busy ? <Spinner /> : <ImagePlus />}
            Ajouter des photos
          </Button>

          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : isError ? (
            <LoadErrorState error={error} onRetry={() => void refetch()} />
          ) : images.length === 0 ? (
            <EmptyState
              icon={Images}
              title="Aucune photo"
              description="Ajoutez les photos que vous voulez montrer. Vous pourrez les réordonner et les légender ensuite."
            />
          ) : (
            <ul className="space-y-3">
              {images.map((image, index) => (
                <li
                  key={image.id}
                  className="flex gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/40">
                    {image.url ? (
                      /* Not next/image: the link is signed, short-lived and already unique, so
                         there is nothing for an optimiser to cache. */
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image.url} alt="" className="size-full object-cover" />
                    ) : (
                      <Images className="size-6 text-muted-foreground" aria-hidden="true" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="truncate text-xs text-muted-foreground">{image.fileName}</p>

                    <Input
                      value={captionOf(image.id, image.caption)}
                      onChange={(event) =>
                        setCaptions((previous) => ({
                          ...previous,
                          [image.id]: event.target.value,
                        }))
                      }
                      placeholder={ex("Toiture refaite, Sainte-Foy")}
                      aria-label={`Légende de ${image.fileName}`}
                    />
                  </div>

                  <div className="flex shrink-0 flex-col gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Monter cette photo"
                      disabled={busy || index === 0}
                      onClick={() => void move(index, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Descendre cette photo"
                      disabled={busy || index === images.length - 1}
                      onClick={() => void move(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Retirer cette photo"
                      disabled={busy}
                      onClick={() =>
                        void persist(
                          current().filter((line) => line.id !== image.id),
                          "Photo retirée de la galerie.",
                        )
                      }
                    >
                      <X />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {images.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Retirer une photo d&apos;une galerie ne la supprime pas de votre bibliothèque : elle
              peut servir ailleurs.
            </p>
          )}
        </div>

        <SheetFooter>
          {images.length > 0 && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void persist(current(), "Légendes enregistrées.")}
            >
              {save.isPending && <Spinner />}
              Enregistrer les légendes
            </Button>
          )}
          <SheetClose render={<Button type="button" variant="outline" />}>Fermer</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
