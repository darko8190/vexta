"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ImagePlus, LayoutTemplate, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { useGalleriesQuery, usePageSectionsQuery, useSavePageSections } from "@/hooks/use-galleries";
import { MAX_UPLOAD_BYTES, useUploadMedia } from "@/hooks/use-media";
import { ApiError } from "@/lib/api";
import { pageSectionKindHints, pageSectionKindLabels } from "@/lib/labels";
import { ex } from "@/lib/placeholders";
import type { PageSection, PublicPageSectionKind, SavePageSectionValues } from "@/lib/types";

const KINDS = Object.keys(pageSectionKindLabels) as PublicPageSectionKind[];

/** A Select cannot hold an empty value, and "no gallery chosen yet" is a real state. */
const NO_GALLERY = "__aucune__";

/** A row being arranged. The key is local and never sent: a new section has no id yet. */
interface Row extends SavePageSectionValues {
  key: string;
  /** Kept so a section already carrying a photograph can show it without a refetch. */
  imageUrl: string | null;
}

function toRows(sections: PageSection[]): Row[] {
  return sections.map((section) => ({
    key: section.id,
    id: section.id,
    kind: section.kind,
    title: section.title,
    text: section.text,
    galleryId: section.galleryId,
    mediaAssetId: section.mediaAssetId,
    columns: section.columns,
    isVisible: section.isVisible,
    imageUrl: section.imageUrl,
  }));
}

function blankRow(): Row {
  return {
    key: `nouvelle-${Math.random().toString(36).slice(2)}`,
    id: null,
    kind: "Texte",
    title: null,
    text: null,
    galleryId: null,
    mediaAssetId: null,
    columns: 1,
    isVisible: true,
    imageUrl: null,
  };
}

/**
 * How the company arranges the middle of its own public page.
 *
 * The head and the foot are not here, on purpose. The colour, the logo, the name and the
 * accroche at the top, and the address, the telephone and the courriel at the bottom, are the
 * two things every visitor actually came for — a company that could hide them would, and the
 * page would stop doing its one job.
 *
 * Saved as a list, like a form's questions, and for the same reason: arranging a page is
 * reordering, retitling and removing in one sitting, and a screen that saved each change alone
 * would be a screen where half an arrangement is a page nobody chose.
 *
 * Columns only arrange a section's own content. There is no grid to understand and no way to
 * put two unrelated things side by side, which is where every page builder starts producing
 * pages nobody can read on a telephone.
 */
export function PageBuilderSection({ canEdit }: { canEdit: boolean }) {
  const { data, isLoading, isError, error, refetch } = usePageSectionsQuery();
  const galleries = useGalleriesQuery();
  const save = useSavePageSections();
  const upload = useUploadMedia();

  // Seeded once, from the first successful read. Nothing mirrors the props afterwards: a
  // background refetch that returned the same thing would otherwise throw away the arranging.
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dirty, setDirty] = useState(false);

  const current = rows ?? (data ? toRows(data) : null);

  function edit(key: string, change: Partial<Row>) {
    setDirty(true);
    setRows((previous) =>
      (previous ?? toRows(data ?? [])).map((row) => (row.key === key ? { ...row, ...change } : row)),
    );
  }

  function move(index: number, direction: -1 | 1) {
    const list = current ?? [];
    const target = index + direction;
    if (target < 0 || target >= list.length) return;

    setDirty(true);
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
  }

  async function pickImage(key: string, file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`${file.name} dépasse la taille permise.`);
      return;
    }

    try {
      const asset = await upload.mutateAsync(file);
      // No signed link for it yet: the builder shows the local file until the next save brings
      // one back, which is better than an empty frame on a photograph that is really there.
      edit(key, { mediaAssetId: asset.id, imageUrl: URL.createObjectURL(file) });
    } catch (failure) {
      toast.error(
        failure instanceof ApiError || failure instanceof Error
          ? failure.message
          : "Impossible de téléverser cette photo.",
      );
    }
  }

  async function persist() {
    const list = current ?? [];

    try {
      await save.mutateAsync(
        list.map((row) => ({
          id: row.id,
          kind: row.kind,
          title: row.title?.trim() || null,
          text: row.text?.trim() || null,
          galleryId: row.galleryId,
          mediaAssetId: row.mediaAssetId,
          columns: row.columns,
          isVisible: row.isVisible,
        })),
      );

      setRows(null);
      setDirty(false);
      toast.success("Page enregistrée.");
    } catch (failure) {
      // The API refuses a text section with no text, a gallery with no gallery chosen and a
      // photo section with no photo — each says which, so the message is worth showing as it is.
      toast.error(
        failure instanceof ApiError ? failure.message : "Impossible d'enregistrer la page.",
      );
    }
  }

  const addButton = canEdit ? (
    <Button
      variant="outline"
      onClick={() => {
        setDirty(true);
        setRows([...(current ?? []), blankRow()]);
      }}
    >
      <Plus />
      Ajouter une section
    </Button>
  ) : undefined;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Constructeur de page</h2>
          <p className="text-sm text-muted-foreground">
            Ce qui apparaît entre l&apos;en-tête et le pied de votre page publique.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {addButton}
          {canEdit && (
            <Button onClick={() => void persist()} disabled={save.isPending || !dirty}>
              {save.isPending && <Spinner />}
              Enregistrer la page
            </Button>
          )}
        </div>
      </div>

      <Alert className="mb-4">
        <AlertDescription>
          L&apos;en-tête — votre couleur, votre logo, votre nom, votre accroche — et le pied —
          votre adresse, votre téléphone, votre courriel — sont toujours là et ne se déplacent
          pas. Tant que vous n&apos;ajoutez aucune section, votre page garde exactement
          l&apos;allure qu&apos;elle a aujourd&apos;hui.
        </AlertDescription>
      </Alert>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-32 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Sections indisponibles"
          fallback="Les sections n'ont pas pu être chargées."
          onRetry={() => void refetch()}
        />
      ) : (current ?? []).length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="Aucune section"
          description="Votre page est dessinée par Vexta : à propos, produits, offres, formulaires. Ajoutez une section et c'est vous qui décidez de l'ordre et du contenu."
          action={addButton}
        />
      ) : (
        <div className="space-y-3">
          {(current ?? []).map((row, index) => (
            <div key={row.key} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 space-y-3">
                  <Field>
                    <FieldLabel htmlFor={`kind-${row.key}`}>Contenu</FieldLabel>
                    <Select
                      value={row.kind}
                      disabled={!canEdit}
                      onValueChange={(value) =>
                        edit(row.key, { kind: (value ?? "Texte") as PublicPageSectionKind })
                      }
                    >
                      <SelectTrigger id={`kind-${row.key}`} className="w-full">
                        <SelectValue>
                          {(value: PublicPageSectionKind) => pageSectionKindLabels[value]}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {KINDS.map((kind) => (
                          <SelectItem key={kind} value={kind}>
                            {pageSectionKindLabels[kind]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>{pageSectionKindHints[row.kind]}</FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor={`title-${row.key}`}>Titre</FieldLabel>
                    <Input
                      id={`title-${row.key}`}
                      value={row.title ?? ""}
                      disabled={!canEdit}
                      onChange={(event) => edit(row.key, { title: event.target.value })}
                      placeholder={ex("Nos réalisations")}
                    />
                    <FieldDescription>
                      Vide, la section n&apos;a pas de titre du tout — ce qui va bien à une photo
                      pleine largeur.
                    </FieldDescription>
                  </Field>

                  {row.kind === "Texte" && (
                    <Field>
                      <FieldLabel htmlFor={`text-${row.key}`}>Texte</FieldLabel>
                      <Textarea
                        id={`text-${row.key}`}
                        rows={5}
                        disabled={!canEdit}
                        value={row.text ?? ""}
                        onChange={(event) => edit(row.key, { text: event.target.value })}
                        placeholder={ex("Nous refaisons des toitures à Québec depuis 2008…")}
                      />
                      <FieldDescription>
                        Vos sauts de ligne sont la seule mise en forme : ils sont conservés tels
                        quels.
                      </FieldDescription>
                    </Field>
                  )}

                  {row.kind === "Galerie" && (
                    <Field>
                      <FieldLabel htmlFor={`gallery-${row.key}`}>Galerie</FieldLabel>
                      <Select
                        value={row.galleryId ?? NO_GALLERY}
                        disabled={!canEdit}
                        onValueChange={(value) =>
                          edit(row.key, { galleryId: value === NO_GALLERY ? null : (value ?? null) })
                        }
                      >
                        <SelectTrigger id={`gallery-${row.key}`} className="w-full">
                          <SelectValue>
                            {(value: string) =>
                              value === NO_GALLERY
                                ? "Choisir…"
                                : ((galleries.data ?? []).find((item) => item.id === value)?.name ??
                                  "Choisir…")
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_GALLERY}>Choisir…</SelectItem>
                          {(galleries.data ?? []).map((gallery) => (
                            <SelectItem key={gallery.id} value={gallery.id}>
                              {gallery.name} ({gallery.imageCount})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        Les galeries se montent dans l&apos;onglet{" "}
                        <Link href="/entreprise" className="underline underline-offset-4">
                          Galeries
                        </Link>
                        . Une galerie vide n&apos;apparaît pas sur la page.
                      </FieldDescription>
                    </Field>
                  )}

                  {row.kind === "Image" && (
                    <Field>
                      <FieldLabel htmlFor={`image-${row.key}`}>Photo</FieldLabel>

                      <div className="flex items-center gap-3">
                        <div className="flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted/40">
                          {row.imageUrl ? (
                            /* Not next/image: a signed link, or a blob from the file just
                               picked. Neither is something an optimiser can cache. */
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={row.imageUrl} alt="" className="size-full object-cover" />
                          ) : (
                            <ImagePlus className="size-5 text-muted-foreground" aria-hidden="true" />
                          )}
                        </div>

                        <Input
                          id={`image-${row.key}`}
                          type="file"
                          accept="image/*"
                          disabled={!canEdit || upload.isPending}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void pickImage(row.key, file);
                            event.target.value = "";
                          }}
                        />
                      </div>

                      <FieldDescription>
                        Elle s&apos;affiche sur toute la largeur de la page.
                      </FieldDescription>
                    </Field>
                  )}

                  {(row.kind === "Galerie" || row.kind === "Produits" || row.kind === "Texte") && (
                    <Field>
                      <FieldLabel htmlFor={`columns-${row.key}`}>Colonnes</FieldLabel>
                      <Select
                        value={String(row.columns)}
                        disabled={!canEdit}
                        onValueChange={(value) => edit(row.key, { columns: Number(value ?? 1) })}
                      >
                        <SelectTrigger id={`columns-${row.key}`} className="w-full">
                          <SelectValue>{(value: string) => `${value} colonne${value === "1" ? "" : "s"}`}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3].map((count) => (
                            <SelectItem key={count} value={String(count)}>
                              {count} colonne{count === 1 ? "" : "s"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        Sur un téléphone, tout revient à une colonne — c&apos;est la seule façon
                        que la page reste lisible.
                      </FieldDescription>
                    </Field>
                  )}

                  <Field orientation="horizontal">
                    <Checkbox
                      id={`visible-${row.key}`}
                      checked={row.isVisible}
                      disabled={!canEdit}
                      onCheckedChange={(checked) => edit(row.key, { isVisible: checked === true })}
                    />
                    <FieldLabel htmlFor={`visible-${row.key}`} className="font-normal">
                      Visible
                    </FieldLabel>
                  </Field>
                </div>

                {canEdit && (
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Monter cette section"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Descendre cette section"
                      disabled={index === (current ?? []).length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Retirer cette section"
                      onClick={() => {
                        setDirty(true);
                        setRows((current ?? []).filter((candidate) => candidate.key !== row.key));
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
