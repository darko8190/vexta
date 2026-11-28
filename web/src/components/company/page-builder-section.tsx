"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Building2,
  Circle,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  ImagePlus,
  LayoutTemplate,
  MousePointerClick,
  Plus,
  RectangleHorizontal,
  Square,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { backgroundClass, CellBlock, cellsGridClass, ContactFooter } from "@/components/public/page-blocks";
import { useGalleriesQuery, usePagePreviewQuery, usePageSectionsQuery, useSavePageSections } from "@/hooks/use-galleries";
import { MAX_UPLOAD_BYTES, useUploadMedia } from "@/hooks/use-media";
import { ApiError } from "@/lib/api";
import {
  pageItemShapeLabels,
  pageSectionBackgroundLabels,
  pageSectionKindHints,
  pageSectionKindLabels,
} from "@/lib/labels";
import { styleTokensFor, type PublicPageStyleTokens } from "@/lib/public-page-style";
import type {
  PageItemShape,
  PagePreview,
  PageSection,
  PageSectionBackground,
  PublicCell,
  PublicPageSectionKind,
  SavePageCellValues,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const KINDS = Object.keys(pageSectionKindLabels) as PublicPageSectionKind[];
const BACKGROUNDS = Object.keys(pageSectionBackgroundLabels) as PageSectionBackground[];
const SHAPES: { value: PageItemShape; icon: typeof Square }[] = [
  { value: "Rectangle", icon: RectangleHorizontal },
  { value: "Carre", icon: Square },
  { value: "Rond", icon: Circle },
];

/** A Select cannot hold an empty value, and "nothing chosen yet" is a real state. */
const NONE = "__aucun__";

/** A column being edited. The picture's link is kept so it shows without a refetch. */
interface DraftCell extends SavePageCellValues {
  imageUrl: string | null;
}

/** A band being edited. The key is local and never sent: a new band has no id yet. */
interface DraftSection {
  key: string;
  id: string | null;
  title: string | null;
  background: PageSectionBackground;
  isVisible: boolean;
  cells: DraftCell[];
}

interface Selection {
  section: string;
  cell: number | null;
}

function newKey() {
  return `nouvelle-${Math.random().toString(36).slice(2)}`;
}

function blankCell(kind: PublicPageSectionKind = "Texte"): DraftCell {
  return {
    kind,
    title: null,
    text: null,
    galleryId: null,
    mediaAssetId: null,
    formTemplateId: null,
    itemsPerRow: kind === "Emplois" ? 1 : 3,
    shape: "Rectangle",
    imageUrl: null,
  };
}

function toDraft(sections: PageSection[]): DraftSection[] {
  return sections.map((section) => ({
    key: section.id,
    id: section.id,
    title: section.title,
    background: section.background,
    isVisible: section.isVisible,
    cells: section.cells.map((cell) => ({
      kind: cell.kind,
      title: cell.title,
      text: cell.text,
      galleryId: cell.galleryId,
      mediaAssetId: cell.mediaAssetId,
      formTemplateId: cell.formTemplateId,
      itemsPerRow: cell.itemsPerRow,
      shape: cell.shape,
      imageUrl: cell.imageUrl,
    })),
  }));
}

/** What the column would show a visitor, from the draft and what the preview brought. */
function toPublicCell(cell: DraftCell, preview: PagePreview): PublicCell {
  return {
    kind: cell.kind,
    title: null,
    text: cell.text,
    itemsPerRow: cell.itemsPerRow,
    shape: cell.shape,
    images: cell.galleryId ? (preview.galleries[cell.galleryId] ?? []) : [],
    imageUrl: cell.imageUrl,
    form: preview.forms.find((form) => form.id === cell.formTemplateId) ?? null,
  };
}

/** Why a column draws nothing yet, said where the owner is looking. */
function emptyReason(cell: DraftCell, preview: PagePreview): string | null {
  switch (cell.kind) {
    case "Texte":
      return null;
    case "Galerie":
      if (!cell.galleryId) return "Choisissez une galerie dans le panneau.";
      return (preview.galleries[cell.galleryId] ?? []).length === 0 ? "Cette galerie est vide." : null;
    case "Image":
      return cell.imageUrl ? null : "Choisissez une photo dans le panneau.";
    case "Formulaire":
      return cell.formTemplateId ? null : "Choisissez le formulaire dans le panneau.";
    case "Produits":
      if (!preview.showProducts) {
        return "Les produits sont masqués : activez « Afficher les produits » dans l'onglet Page publique.";
      }
      return preview.company.products.length === 0 ? "Aucun produit n'est coché comme public." : null;
    case "Emplois":
      if (!preview.showJobs) return "Les offres sont masquées : activez-les dans l'onglet Page publique.";
      return preview.company.jobs.length === 0 ? "Aucune offre publiée." : null;
    case "Formulaires":
      if (!preview.showForms) return "Les formulaires sont masqués : activez-les dans l'onglet Page publique.";
      return preview.company.forms.length === 0 ? "Aucun formulaire coché « sur la page publique »." : null;
    default:
      return null;
  }
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * How the company arranges the middle of its own public page, on the page itself.
 *
 * The page is drawn as a visitor will read it, in the company's chosen style, and edited where
 * it stands: titles and text are typed in place, a click on a column opens what it shows in the
 * panel beside it. Each band is a row of one to twelve columns.
 *
 * The head and the foot are drawn but not editable. The name and the way to reach the company
 * are what every visitor came for, and a company that could hide them would.
 *
 * Saved as a list, like a form's questions: arranging a page is reordering, retitling and
 * removing in one sitting.
 */
export function PageBuilderSection({ canEdit }: { canEdit: boolean }) {
  const sections = usePageSectionsQuery();
  const preview = usePagePreviewQuery();
  const galleries = useGalleriesQuery();
  const save = useSavePageSections();
  const upload = useUploadMedia();

  // Seeded once, from the first successful read: a background refetch must not throw away the
  // arranging.
  const [draft, setDraft] = useState<DraftSection[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);

  const current = draft ?? (sections.data ? toDraft(sections.data) : null);

  // A page arranged for twenty minutes and lost to a closed tab is the one mistake this screen
  // must not allow.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(next: (list: DraftSection[]) => DraftSection[]) {
    setDirty(true);
    setDraft((previous) => next(previous ?? current ?? []));
  }

  function editSection(key: string, patch: Partial<DraftSection>) {
    change((list) => list.map((section) => (section.key === key ? { ...section, ...patch } : section)));
  }

  function editCell(key: string, index: number, patch: Partial<DraftCell>) {
    change((list) =>
      list.map((section) =>
        section.key === key
          ? { ...section, cells: section.cells.map((cell, i) => (i === index ? { ...cell, ...patch } : cell)) }
          : section,
      ),
    );
  }

  function setColumns(key: string, count: number) {
    change((list) =>
      list.map((section) => {
        if (section.key !== key) return section;
        const cells = section.cells.slice(0, count);
        while (cells.length < count) cells.push(blankCell());
        return { ...section, cells };
      }),
    );
    if (selection?.section === key && selection.cell !== null && selection.cell >= count) {
      setSelection({ section: key, cell: null });
    }
  }

  function moveSection(index: number, direction: -1 | 1) {
    change((list) => {
      const target = index + direction;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function moveCell(key: string, index: number, direction: -1 | 1) {
    change((list) =>
      list.map((section) => {
        if (section.key !== key) return section;
        const target = index + direction;
        if (target < 0 || target >= section.cells.length) return section;
        const cells = [...section.cells];
        [cells[index], cells[target]] = [cells[target], cells[index]];
        return { ...section, cells };
      }),
    );
    setSelection({ section: key, cell: index + direction });
  }

  function addSection(after?: number) {
    const section: DraftSection = {
      key: newKey(),
      id: null,
      title: null,
      background: "Aucun",
      isVisible: true,
      cells: [blankCell()],
    };
    change((list) => {
      const next = [...list];
      next.splice(after === undefined ? next.length : after + 1, 0, section);
      return next;
    });
    setSelection({ section: section.key, cell: 0 });
  }

  function duplicateSection(index: number) {
    change((list) => {
      const copy = { ...list[index], key: newKey(), id: null, cells: list[index].cells.map((cell) => ({ ...cell })) };
      const next = [...list];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }

  function removeSection(key: string) {
    change((list) => list.filter((section) => section.key !== key));
    if (selection?.section === key) setSelection(null);
  }

  async function pickImage(key: string, index: number, file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`${file.name} dépasse la taille permise.`);
      return;
    }

    try {
      const asset = await upload.mutateAsync(file);
      // The local file until the next save brings a signed link back.
      editCell(key, index, { mediaAssetId: asset.id, imageUrl: URL.createObjectURL(file) });
    } catch (failure) {
      toast.error(
        failure instanceof ApiError || failure instanceof Error ? failure.message : "Impossible de téléverser cette photo.",
      );
    }
  }

  async function persist() {
    try {
      await save.mutateAsync(
        (current ?? []).map((section) => ({
          id: section.id,
          title: section.title?.trim() || null,
          background: section.background,
          isVisible: section.isVisible,
          cells: section.cells.map((cell) => ({
            kind: cell.kind,
            title: cell.title?.trim() || null,
            text: cell.text?.trim() || null,
            galleryId: cell.galleryId,
            mediaAssetId: cell.mediaAssetId,
            formTemplateId: cell.formTemplateId,
            itemsPerRow: cell.itemsPerRow,
            shape: cell.shape,
          })),
        })),
      );

      setDraft(null);
      setDirty(false);
      setSelection(null);
      toast.success("Page enregistrée.");
    } catch (failure) {
      // Each refusal says which column is missing what, so it is worth showing as it is.
      toast.error(failure instanceof ApiError ? failure.message : "Impossible d'enregistrer la page.");
    }
  }

  const loading = sections.isLoading || preview.isLoading;
  const failed = sections.isError ? sections : preview.isError ? preview : null;

  const selectedSection = current?.find((section) => section.key === selection?.section) ?? null;
  const cellIndex = selection?.cell ?? null;
  const selectedCell = selectedSection && cellIndex !== null ? (selectedSection.cells[cellIndex] ?? null) : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Constructeur de page</h2>
          <p className="text-sm text-muted-foreground">
            Modifiez votre page directement : écrivez dans les titres et les textes, cliquez sur une colonne pour choisir
            ce qu&apos;elle affiche.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {preview.data && (
            <Link
              href={`/e/${encodeURIComponent(preview.data.company.slug)}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              <ExternalLink className="size-4" />
              Voir ma page
            </Link>
          )}
          {canEdit && (
            <Button onClick={() => void persist()} disabled={save.isPending || !dirty}>
              {save.isPending && <Spinner />}
              Enregistrer la page
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[480px] w-full" />
      ) : failed ? (
        <LoadErrorState
          error={failed.error}
          title="Constructeur indisponible"
          fallback="La page n'a pas pu être chargée."
          onRetry={() => {
            void sections.refetch();
            void preview.refetch();
          }}
        />
      ) : preview.data && current ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Canvas
            preview={preview.data}
            sections={current}
            selection={selection}
            canEdit={canEdit}
            onSelect={setSelection}
            onAdd={addSection}
            onEditSection={editSection}
            onEditCell={editCell}
            onColumns={setColumns}
            onMove={moveSection}
            onDuplicate={duplicateSection}
            onRemove={removeSection}
          />

          <aside className="rounded-xl border border-border bg-card p-4 lg:sticky lg:top-4">
            {selectedSection && selectedCell && cellIndex !== null ? (
              <CellInspector
                key={`${selectedSection.key}-${cellIndex}`}
                cell={selectedCell}
                index={cellIndex}
                count={selectedSection.cells.length}
                preview={preview.data}
                galleries={(galleries.data ?? []).map((gallery) => ({
                  id: gallery.id,
                  name: gallery.name,
                  count: gallery.imageCount,
                }))}
                canEdit={canEdit}
                uploading={upload.isPending}
                onChange={(patch) => editCell(selectedSection.key, cellIndex, patch)}
                onMove={(direction) => moveCell(selectedSection.key, cellIndex, direction)}
                onPickImage={(file) => void pickImage(selectedSection.key, cellIndex, file)}
              />
            ) : (
              <div className="space-y-2 text-sm text-muted-foreground">
                <MousePointerClick className="size-5 text-foreground" aria-hidden="true" />
                <p className="font-medium text-foreground">Cliquez sur une colonne</p>
                <p>
                  Ses réglages s&apos;ouvrent ici : ce qu&apos;elle affiche, combien par rangée, la forme des produits et
                  des offres.
                </p>
                <p>
                  Le nombre de colonnes d&apos;une section (jusqu&apos;à 12), son fond et son ordre se règlent dans la barre
                  au-dessus de chaque section.
                </p>
                <p>Sur un téléphone, les colonnes s&apos;empilent toujours.</p>
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function Canvas({
  preview,
  sections,
  selection,
  canEdit,
  onSelect,
  onAdd,
  onEditSection,
  onEditCell,
  onColumns,
  onMove,
  onDuplicate,
  onRemove,
}: {
  preview: PagePreview;
  sections: DraftSection[];
  selection: Selection | null;
  canEdit: boolean;
  onSelect: (selection: Selection | null) => void;
  onAdd: (after?: number) => void;
  onEditSection: (key: string, patch: Partial<DraftSection>) => void;
  onEditCell: (key: string, index: number, patch: Partial<DraftCell>) => void;
  onColumns: (key: string, count: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDuplicate: (index: number) => void;
  onRemove: (key: string) => void;
}) {
  const company = preview.company;
  const s = styleTokensFor(company.style);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      {/* The fixed head, drawn as it is and dimmed: it is the page's, not the builder's. */}
      <div className="pointer-events-none opacity-80 select-none" aria-hidden="true">
        <div className={s.accentBar} />
        <header className={s.header}>
          <div className={cn(s.container, "py-8")}>
            <div className={s.headerInner}>
              <div className={s.logoFrame}>
                {company.logoETag ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/company/${company.tenantId}/logo?v=${company.logoETag}`}
                    alt=""
                    className="size-full object-contain p-2"
                  />
                ) : (
                  <Building2 className="size-8 text-muted-foreground" />
                )}
              </div>
              <div className={cn(s.headerText, "flex-1")}>
                <p className={s.title}>{company.name}</p>
                {company.headline?.trim() && <p className={s.headline}>{company.headline.trim()}</p>}
              </div>
            </div>
          </div>
        </header>
      </div>

      <div className={cn(s.container, "py-8")}>
        {sections.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
            <LayoutTemplate className="size-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Aucune section</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Votre page est dessinée par Vexta : à propos, produits, offres, formulaires. Ajoutez une section et
              c&apos;est vous qui décidez de l&apos;ordre et du contenu.
            </p>
            {canEdit && (
              <Button variant="outline" onClick={() => onAdd()}>
                <Plus />
                Ajouter une section
              </Button>
            )}
          </div>
        ) : (
          <div className={s.sectionGap}>
            {sections.map((section, index) => (
              <SectionEditor
                key={section.key}
                section={section}
                index={index}
                total={sections.length}
                preview={preview}
                s={s}
                selection={selection}
                canEdit={canEdit}
                onSelect={onSelect}
                onAdd={() => onAdd(index)}
                onEdit={(patch) => onEditSection(section.key, patch)}
                onEditCell={(cell, patch) => onEditCell(section.key, cell, patch)}
                onColumns={(count) => onColumns(section.key, count)}
                onMove={(direction) => onMove(index, direction)}
                onDuplicate={() => onDuplicate(index)}
                onRemove={() => onRemove(section.key)}
              />
            ))}

            {canEdit && (
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => onAdd()}>
                  <Plus />
                  Ajouter une section
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="pointer-events-none opacity-80 select-none" aria-hidden="true">
        <ContactFooter
          company={company}
          s={s}
          lines={company.address?.city ? [company.address.city] : []}
        />
      </div>
    </div>
  );
}

function SectionEditor({
  section,
  index,
  total,
  preview,
  s,
  selection,
  canEdit,
  onSelect,
  onAdd,
  onEdit,
  onEditCell,
  onColumns,
  onMove,
  onDuplicate,
  onRemove,
}: {
  section: DraftSection;
  index: number;
  total: number;
  preview: PagePreview;
  s: PublicPageStyleTokens;
  selection: Selection | null;
  canEdit: boolean;
  onSelect: (selection: Selection | null) => void;
  onAdd: () => void;
  onEdit: (patch: Partial<DraftSection>) => void;
  onEditCell: (cell: number, patch: Partial<DraftCell>) => void;
  onColumns: (count: number) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const selected = selection?.section === section.key;
  const columns = section.cells.length;

  return (
    <div
      className={cn(
        "relative rounded-xl outline-2 outline-offset-8",
        selected ? "outline outline-primary" : "outline outline-transparent hover:outline-dashed hover:outline-border",
        !section.isVisible && "opacity-50",
      )}
      onClick={() => onSelect({ section: section.key, cell: null })}
    >
      {canEdit && (
        <div
          className="mb-3 flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-xs text-muted-foreground shadow-xs"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="mr-1 font-medium text-foreground">Section {index + 1}</span>
          {!section.isVisible && <Badge variant="outline">Masquée</Badge>}

          <Select value={String(columns)} onValueChange={(value) => onColumns(Number(value ?? 1))}>
            <SelectTrigger size="sm" className="w-auto gap-1 text-xs" aria-label="Nombre de colonnes">
              <SelectValue>{(value: string) => `${value} colonne${value === "1" ? "" : "s"}`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((count) => (
                <SelectItem key={count} value={String(count)}>
                  {count} colonne{count === 1 ? "" : "s"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={section.background}
            onValueChange={(value) => onEdit({ background: (value ?? "Aucun") as PageSectionBackground })}
          >
            <SelectTrigger size="sm" className="w-auto gap-1 text-xs" aria-label="Fond de la section">
              <SelectValue>{(value: PageSectionBackground) => pageSectionBackgroundLabels[value]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {BACKGROUNDS.map((background) => (
                <SelectItem key={background} value={background}>
                  {pageSectionBackgroundLabels[background]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center">
            <IconButton
              label={section.isVisible ? "Masquer cette section" : "Afficher cette section"}
              onClick={() => onEdit({ isVisible: !section.isVisible })}
            >
              {section.isVisible ? <Eye /> : <EyeOff />}
            </IconButton>
            <IconButton label="Monter" onClick={() => onMove(-1)} disabled={index === 0}>
              <ArrowUp />
            </IconButton>
            <IconButton label="Descendre" onClick={() => onMove(1)} disabled={index === total - 1}>
              <ArrowDown />
            </IconButton>
            <IconButton label="Dupliquer" onClick={onDuplicate}>
              <Copy />
            </IconButton>
            <IconButton label="Ajouter une section en dessous" onClick={onAdd}>
              <Plus />
            </IconButton>
            <IconButton label="Retirer cette section" onClick={onRemove}>
              <Trash2 />
            </IconButton>
          </div>
        </div>
      )}

      <section className={cn("@container", backgroundClass[section.background])}>
        <input
          value={section.title ?? ""}
          disabled={!canEdit}
          onChange={(event) => onEdit({ title: event.target.value })}
          onFocus={() => onSelect({ section: section.key, cell: null })}
          placeholder="Titre de la section (facultatif)"
          aria-label={`Titre de la section ${index + 1}`}
          className={cn(
            s.sectionTitle,
            "w-full rounded bg-transparent outline-none placeholder:font-normal placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/50",
          )}
        />

        <div className={cn(cellsGridClass(columns), "mt-4")} style={{ "--cols": columns } as React.CSSProperties}>
          {section.cells.map((cell, cellIndex) => {
            const isSelected = selected && selection?.cell === cellIndex;
            const reason = emptyReason(cell, preview);
            const choose = () => onSelect({ section: section.key, cell: cellIndex });

            return (
              <div
                key={cellIndex}
                role="button"
                tabIndex={0}
                aria-label={`Colonne ${cellIndex + 1} : ${pageSectionKindLabels[cell.kind]}`}
                aria-pressed={isSelected}
                onClick={(event) => {
                  event.stopPropagation();
                  choose();
                }}
                onFocusCapture={choose}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    choose();
                  }
                }}
                className={cn(
                  "-m-2 min-w-0 cursor-pointer rounded-lg p-2 outline-2 outline-offset-2",
                  isSelected
                    ? "outline outline-primary"
                    : "outline outline-transparent hover:outline-dashed hover:outline-border",
                )}
              >
                <p className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                  {pageSectionKindLabels[cell.kind]}
                </p>

                <input
                  value={cell.title ?? ""}
                  disabled={!canEdit}
                  onChange={(event) => onEditCell(cellIndex, { title: event.target.value })}
                  placeholder="Titre (facultatif)"
                  aria-label={`Titre de la colonne ${cellIndex + 1}`}
                  className={cn(
                    s.sectionTitle,
                    "mb-2 w-full rounded bg-transparent outline-none placeholder:font-normal placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring/50",
                  )}
                />

                {cell.kind === "Texte" ? (
                  <textarea
                    value={cell.text ?? ""}
                    disabled={!canEdit}
                    onChange={(event) => onEditCell(cellIndex, { text: event.target.value })}
                    placeholder="Écrivez ici…"
                    aria-label={`Texte de la colonne ${cellIndex + 1}`}
                    rows={3}
                    className="field-sizing-content min-h-16 w-full resize-none rounded bg-transparent text-base leading-relaxed text-muted-foreground outline-none placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                ) : reason ? (
                  <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    {reason}
                  </p>
                ) : (
                  // Drawn exactly as a visitor sees it, but inert: nothing opens and nothing goes
                  // in a basket while the page is being arranged.
                  <div className="pointer-events-none select-none" inert>
                    <CellBlock cell={toPublicCell(cell, preview)} company={preview.company} s={s} preview />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function CellInspector({
  cell,
  index,
  count,
  preview,
  galleries,
  canEdit,
  uploading,
  onChange,
  onMove,
  onPickImage,
}: {
  cell: DraftCell;
  index: number;
  count: number;
  preview: PagePreview;
  galleries: { id: string; name: string; count: number }[];
  canEdit: boolean;
  uploading: boolean;
  onChange: (patch: Partial<DraftCell>) => void;
  onMove: (direction: -1 | 1) => void;
  onPickImage: (file: File) => void;
}) {
  const listsItems = cell.kind === "Produits" || cell.kind === "Emplois" || cell.kind === "Galerie";
  const hasShape = cell.kind === "Produits" || cell.kind === "Emplois";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">
          Colonne {index + 1} sur {count}
        </p>
        {count > 1 && canEdit && (
          <div className="flex">
            <IconButton label="Déplacer à gauche" onClick={() => onMove(-1)} disabled={index === 0}>
              <ArrowLeft />
            </IconButton>
            <IconButton label="Déplacer à droite" onClick={() => onMove(1)} disabled={index === count - 1}>
              <ArrowRight />
            </IconButton>
          </div>
        )}
      </div>

      <Field>
        <FieldLabel htmlFor="cell-kind">Ce qu&apos;elle affiche</FieldLabel>
        <Select
          value={cell.kind}
          disabled={!canEdit}
          onValueChange={(value) => {
            const kind = (value ?? "Texte") as PublicPageSectionKind;
            onChange({ kind, itemsPerRow: kind === "Emplois" ? 1 : cell.itemsPerRow });
          }}
        >
          <SelectTrigger id="cell-kind" className="w-full">
            <SelectValue>{(value: PublicPageSectionKind) => pageSectionKindLabels[value]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {pageSectionKindLabels[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>{pageSectionKindHints[cell.kind]}</FieldDescription>
      </Field>

      {cell.kind === "Texte" && (
        <p className="text-sm text-muted-foreground">
          Écrivez le titre et le texte directement dans la page. Une colonne Texte vide sert d&apos;espace.
        </p>
      )}

      {cell.kind === "Galerie" && (
        <Field>
          <FieldLabel htmlFor="cell-gallery">Galerie</FieldLabel>
          <Select
            value={cell.galleryId ?? NONE}
            disabled={!canEdit}
            onValueChange={(value) => onChange({ galleryId: value === NONE ? null : (value ?? null) })}
          >
            <SelectTrigger id="cell-gallery" className="w-full">
              <SelectValue>
                {(value: string) =>
                  value === NONE ? "Choisir…" : (galleries.find((item) => item.id === value)?.name ?? "Choisir…")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Choisir…</SelectItem>
              {galleries.map((gallery) => (
                <SelectItem key={gallery.id} value={gallery.id}>
                  {gallery.name} ({gallery.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>Les galeries se montent dans l&apos;onglet Galeries.</FieldDescription>
        </Field>
      )}

      {cell.kind === "Image" && (
        <Field>
          <FieldLabel htmlFor="cell-image">Photo</FieldLabel>
          <div className="flex h-24 items-center justify-center overflow-hidden rounded border border-border bg-muted/40">
            {cell.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cell.imageUrl} alt="" className="size-full object-cover" />
            ) : (
              <ImagePlus className="size-5 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          <Input
            id="cell-image"
            type="file"
            accept="image/*"
            disabled={!canEdit || uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onPickImage(file);
              event.target.value = "";
            }}
          />
        </Field>
      )}

      {cell.kind === "Formulaire" && (
        <Field>
          <FieldLabel htmlFor="cell-form">Formulaire</FieldLabel>
          <Select
            value={cell.formTemplateId ?? NONE}
            disabled={!canEdit}
            onValueChange={(value) => onChange({ formTemplateId: value === NONE ? null : (value ?? null) })}
          >
            <SelectTrigger id="cell-form" className="w-full">
              <SelectValue>
                {(value: string) =>
                  value === NONE ? "Choisir…" : (preview.forms.find((form) => form.id === value)?.title ?? "Choisir…")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Choisir…</SelectItem>
              {preview.forms.map((form) => (
                <SelectItem key={form.id} value={form.id}>
                  {form.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            Seuls les formulaires publiés sont offerts. Ses questions s&apos;affichent directement dans la colonne.
          </FieldDescription>
        </Field>
      )}

      {listsItems && (
        <Field>
          <FieldLabel htmlFor="cell-per-row">Par rangée</FieldLabel>
          <Select
            value={String(cell.itemsPerRow)}
            disabled={!canEdit}
            onValueChange={(value) => onChange({ itemsPerRow: Number(value ?? 3) })}
          >
            <SelectTrigger id="cell-per-row" className="w-full">
              <SelectValue>{(value: string) => `${value} par rangée`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6].map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option} par rangée
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>Dans une colonne étroite ou sur un téléphone, il y en a moins.</FieldDescription>
        </Field>
      )}

      {hasShape && (
        <Field>
          <FieldLabel>Forme</FieldLabel>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Forme">
            {SHAPES.map(({ value, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={cell.shape === value}
                disabled={!canEdit}
                onClick={() => onChange({ shape: value })}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition-colors",
                  cell.shape === value
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {pageItemShapeLabels[value]}
              </button>
            ))}
          </div>
          <FieldDescription>
            Les visiteurs cliquent sur {cell.kind === "Produits" ? "un produit" : "une offre"} pour voir sa fiche
            complète.
          </FieldDescription>
        </Field>
      )}
    </div>
  );
}
