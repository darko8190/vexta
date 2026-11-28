"use client";

import { useState } from "react";
import { ImagePlus, Images, Star, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { MAX_UPLOAD_BYTES, useUploadMedia } from "@/hooks/use-media";
import { useProductImagesQuery, useSaveProductImages } from "@/hooks/use-products";
import { ApiError } from "@/lib/api";
import { ex } from "@/lib/placeholders";
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
  const [adding, setAdding] = useState(false);

  const current = images ?? [];

  async function saveAll(next: ImageInput[], success: string) {
    try {
      await save.mutateAsync(next);
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer les images.");
    }
  }

  /** Uploads the file, then saves the set with it added — and, when asked, as the main one. */
  async function onAdd(file: File, name: string, isPrimary: boolean): Promise<boolean> {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`${file.name} dépasse la taille permise.`);
      return false;
    }

    try {
      const asset = await upload.mutateAsync(file);
      const added: ImageInput = { mediaAssetId: asset.id, name: name.trim() || null, isPrimary };
      const existing = current.map(inputOf).map((image) => (isPrimary ? { ...image, isPrimary: false } : image));
      // The main picture goes first; the API also places it there.
      await save.mutateAsync(isPrimary ? [added, ...existing] : [...existing, added]);
      toast.success("Image ajoutée.");
      return true;
    } catch (error) {
      toast.error(
        error instanceof ApiError || error instanceof Error ? error.message : `Impossible d'ajouter ${file.name}.`,
      );
      return false;
    }
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
      onClick={() => setAdding(true)}
    >
      <ImagePlus />
      Ajouter une image
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

      <AddImageDialog
        open={adding}
        onOpenChange={setAdding}
        // The first picture of a product is its main one unless said otherwise.
        firstImage={current.length === 0}
        pending={busy}
        onAdd={onAdd}
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

/** The window an image is added through: the file, what to call it, and whether it is the main one. */
function AddImageDialog({
  open,
  onOpenChange,
  firstImage,
  pending,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  firstImage: boolean;
  pending: boolean;
  onAdd: (file: File, name: string, isPrimary: boolean) => Promise<boolean>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [isPrimary, setIsPrimary] = useState(firstImage);
  const [preview, setPreview] = useState<string | null>(null);
  const [missingFile, setMissingFile] = useState(false);

  function reset() {
    setFile(null);
    setName("");
    setIsPrimary(firstImage);
    setPreview(null);
    setMissingFile(false);
  }

  async function submit() {
    if (!file) {
      setMissingFile(true);
      return;
    }
    if (await onAdd(file, name, isPrimary)) onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter une image</DialogTitle>
          <DialogDescription>L&apos;image reste aussi dans votre bibliothèque.</DialogDescription>
        </DialogHeader>

        <form
          className="px-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <FieldGroup>
            <Field data-invalid={missingFile}>
              <FieldLabel htmlFor="product-image-file">Image</FieldLabel>
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="max-h-48 w-full rounded-md border border-border object-contain" />
              )}
              <Input
                id="product-image-file"
                type="file"
                accept="image/*"
                aria-invalid={missingFile}
                onChange={(event) => {
                  const picked = event.target.files?.[0] ?? null;
                  setFile(picked);
                  setMissingFile(false);
                  setPreview(picked ? URL.createObjectURL(picked) : null);
                  // The file's own name as a starting point, without its extension.
                  if (picked && !name.trim()) setName(picked.name.replace(/\.[^.]+$/, ""));
                }}
              />
              {missingFile ? (
                <p className="text-sm text-destructive">Choisissez une image.</p>
              ) : (
                <FieldDescription>Une photo, un dessin ou une fiche en image.</FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="product-image-name">Nom</FieldLabel>
              <Input
                id="product-image-name"
                value={name}
                maxLength={200}
                onChange={(event) => setName(event.target.value)}
                placeholder={ex("Vue de face")}
              />
            </Field>

            <Field orientation="horizontal">
              <Checkbox
                id="product-image-primary"
                checked={isPrimary}
                onCheckedChange={(checked) => setIsPrimary(checked === true)}
              />
              <FieldLabel htmlFor="product-image-primary" className="font-normal">
                Image principale
              </FieldLabel>
            </Field>
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button type="button" onClick={() => void submit()} disabled={pending}>
            {pending && <Spinner />}
            Ajouter l&apos;image
          </Button>
          <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
