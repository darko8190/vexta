"use client";

import { useRef } from "react";
import { ImagePlus, Images, Star, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { MAX_UPLOAD_BYTES, useUploadMedia } from "@/hooks/use-media";
import { useProductImagesQuery, useSaveProductImages } from "@/hooks/use-products";
import { ApiError } from "@/lib/api";
import type { ProductImage } from "@/lib/types";
import { cn } from "@/lib/utils";

type ImageInput = { mediaAssetId: string; name: string | null; isPrimary: boolean };

const inputOf = (image: ProductImage): ImageInput => ({
  mediaAssetId: image.mediaAssetId,
  name: image.name,
  isPrimary: image.isPrimary,
});

/**
 * The product's photographs, each with a name and one of them the main picture — the one shown
 * wherever only one is, on the public page and in the product search.
 *
 * The set is saved whole on every change, which is what makes removing one "save the list
 * without it". The links are signed on the way out and expire, so they are fetched with the
 * section rather than kept anywhere. Works the same for a product and for each of its variants.
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

  async function saveAll(next: ImageInput[], success: string) {
    try {
      await save.mutateAsync(next);
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer les images.");
    }
  }

  async function onPick(files: FileList) {
    const added: ImageInput[] = [];

    for (const file of Array.from(files)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`${file.name} dépasse la taille permise.`);
        continue;
      }

      try {
        const asset = await upload.mutateAsync(file);
        added.push({ mediaAssetId: asset.id, name: null, isPrimary: false });
      } catch (error) {
        toast.error(
          error instanceof ApiError || error instanceof Error
            ? error.message
            : `Impossible de téléverser ${file.name}.`,
        );
      }
    }

    if (added.length === 0) return;
    await saveAll([...current.map(inputOf), ...added], added.length === 1 ? "Image ajoutée." : "Images ajoutées.");
  }

  function onRemove(mediaAssetId: string) {
    void saveAll(
      current.filter((image) => image.mediaAssetId !== mediaAssetId).map(inputOf),
      "Image retirée.",
    );
  }

  function onMakePrimary(mediaAssetId: string) {
    void saveAll(
      current.map((image) => ({ ...inputOf(image), isPrimary: image.mediaAssetId === mediaAssetId })),
      "Image principale changée.",
    );
  }

  function onRename(mediaAssetId: string, name: string) {
    const trimmed = name.trim() || null;
    const image = current.find((item) => item.mediaAssetId === mediaAssetId);
    if (!image || (image.name ?? null) === trimmed) return;
    void saveAll(
      current.map((item) => (item.mediaAssetId === mediaAssetId ? { ...inputOf(item), name: trimmed } : inputOf(item))),
      "Nom de l'image enregistré.",
    );
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
            Donnez un nom à chaque image et choisissez la principale : c&apos;est elle qui s&apos;affiche
            quand une seule image est montrée. Elles restent aussi dans votre bibliothèque.
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="aspect-square w-full" />
          ))}
        </div>
      ) : isError && (!images || isPlaceholderData) ? (
        /* A failed read is not a product without photographs: "Aucune image" would claim the
           pictures were never taken, when they simply could not be fetched. */
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
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {current.map((image) => (
            <li
              key={image.id}
              className={cn(
                "overflow-hidden rounded-lg border bg-card",
                image.isPrimary ? "border-primary ring-1 ring-primary" : "border-border",
              )}
            >
              <div className="relative aspect-square bg-muted/40">
                {image.url ? (
                  /* Not next/image: these are signed, short-lived URLs on another origin, and the
                     optimizer would cache a link that has already expired. */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image.url} alt={image.name ?? image.fileName} className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
                    {image.fileName}
                  </span>
                )}
                {image.isPrimary && (
                  <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    <Star className="size-3 fill-current" />
                    Principale
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Retirer ${image.name ?? image.fileName}`}
                  disabled={busy}
                  onClick={() => onRemove(image.mediaAssetId)}
                  className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-foreground shadow-sm transition-opacity hover:bg-background"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="grid gap-2 p-2">
                <Input
                  key={`${image.id}-${image.name ?? ""}`}
                  aria-label={`Nom de l'image ${image.fileName}`}
                  defaultValue={image.name ?? ""}
                  placeholder={image.fileName}
                  maxLength={200}
                  className="h-8"
                  disabled={busy}
                  onBlur={(event) => onRename(image.mediaAssetId, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
                {!image.isPrimary && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => onMakePrimary(image.mediaAssetId)}
                  >
                    <Star />
                    Image principale
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
