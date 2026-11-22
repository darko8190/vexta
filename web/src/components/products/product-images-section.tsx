"use client";

import { useRef } from "react";
import { ImagePlus, Images, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { MAX_UPLOAD_BYTES, useUploadMedia } from "@/hooks/use-media";
import { useProductImagesQuery, useSaveProductImages } from "@/hooks/use-products";
import { ApiError } from "@/lib/api";

/**
 * The product's photographs.
 *
 * The set is saved whole on every change, which is what makes removing one "save the list
 * without it". The links are signed on the way out and expire, so they are fetched with the
 * section rather than kept anywhere.
 */
export function ProductImagesSection({ productId }: { productId: string }) {
  const {
    data: images,
    isLoading,
    isError,
    isPlaceholderData,
    error: loadError,
    refetch,
  } = useProductImagesQuery(productId);
  const save = useSaveProductImages(productId);
  const upload = useUploadMedia();
  const fileInput = useRef<HTMLInputElement>(null);

  const current = images ?? [];

  async function onPick(files: FileList) {
    const added: string[] = [];

    for (const file of Array.from(files)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`${file.name} dépasse la taille permise.`);
        continue;
      }

      try {
        const asset = await upload.mutateAsync(file);
        added.push(asset.id);
      } catch (error) {
        toast.error(
          error instanceof ApiError || error instanceof Error
            ? error.message
            : `Impossible de téléverser ${file.name}.`,
        );
      }
    }

    if (added.length === 0) return;

    try {
      await save.mutateAsync([...current.map((image) => image.mediaAssetId), ...added]);
      toast.success(added.length === 1 ? "Image ajoutée." : "Images ajoutées.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer les images.");
    }
  }

  async function onRemove(mediaAssetId: string) {
    try {
      await save.mutateAsync(
        current.filter((image) => image.mediaAssetId !== mediaAssetId).map((image) => image.mediaAssetId),
      );
      toast.success("Image retirée.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de retirer cette image.");
    }
  }

  const busy = upload.isPending || save.isPending;

  // Adding is refused while the read has failed: the set is saved whole, so appending to a list
  // we could not read would send the new image alone and erase the ones already there.
  const addButton = (
    <Button
      variant="outline"
      disabled={busy || isLoading || isError}
      onClick={() => fileInput.current?.click()}
    >
      {busy ? <Spinner /> : <ImagePlus />}
      Ajouter des images
    </Button>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Images</h2>
          <p className="text-sm text-muted-foreground">
            À quoi la pièce ressemble. Elles restent aussi dans votre bibliothèque.
          </p>
        </div>
        {addButton}
      </div>

      <input
        ref={fileInput}
        id="product-images-input"
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(event) => {
          const files = event.target.files;
          if (files && files.length > 0) onPick(files);
          event.target.value = "";
        }}
      />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="aspect-square w-full" />
          ))}
        </div>
      ) : isError && (!images || isPlaceholderData) ? (
        /* A failed read is not a product without photographs: "Aucune image" would claim the
           pictures were never taken, when they simply could not be fetched.
           And `isError` alone is too wide: a failed background refetch keeps it true over rows
           that are still right, so the panel only wins with nothing read at all (`!images`) or rows
           left over from another query key (`isPlaceholderData`). */
        <LoadErrorState
          error={loadError}
          title="Images indisponibles"
          fallback="Les images de ce produit n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : current.length === 0 ? (
        <EmptyState
          icon={Images}
          title="Aucune image"
          description="Une photo de la pièce évite de commander la mauvaise."
          action={addButton}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {current.map((image) => (
            <li
              key={image.id}
              className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted/40"
            >
              {image.url ? (
                /* Not next/image: these are signed, short-lived URLs on another origin, and the
                   optimizer would cache a link that has already expired. */
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image.url} alt={image.fileName} className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
                  {image.fileName}
                </span>
              )}
              <button
                type="button"
                aria-label={`Retirer ${image.fileName}`}
                disabled={busy}
                onClick={() => onRemove(image.mediaAssetId)}
                className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-foreground shadow-sm transition-opacity hover:bg-background"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
