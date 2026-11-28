"use client";

import { useMemo, useRef, useState } from "react";
import { BriefcaseBusiness, ChevronLeft, ChevronRight, FileText, ImageIcon, Search } from "lucide-react";
import { AddToBasketButton } from "@/components/public/basket-panel";
import { JobApplicationDialog } from "@/components/public/job-application-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { employmentTypeLabels } from "@/lib/labels";
import type { PublicPageStyleTokens } from "@/lib/public-page-style";
import type { PageItemShape, PublicCompany, PublicJob, PublicProduct } from "@/lib/types";
import { cn } from "@/lib/utils";

const money = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" });

/**
 * A variant's own part of its name: "Tuyau PVC 2 po" under "Tuyau PVC" is "2 po". The visitor
 * is already looking at the parent, and the choice reads better without it repeated.
 */
function variantLabel(parent: string, variant: string): string {
  if (!variant.toLocaleLowerCase("fr").startsWith(parent.toLocaleLowerCase("fr"))) return variant;
  const rest = variant.slice(parent.length).replace(/^[\s\-–—:,]+/, "").trim();
  return rest || variant;
}

/** What a product or posting with no category is listed under. */
const OTHER = "Autres";

/**
 * How many side by side, measured on the column the list sits in rather than on the window:
 * a list of four across in a column a quarter of the page wide is one across.
 *
 * Every class written out in full, so the stylesheet generator can find it.
 */
export function itemsGridClass(perRow: number): string {
  if (perRow >= 5) return "grid gap-4 @sm:grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-[repeat(var(--per),minmax(0,1fr))]";
  if (perRow >= 3) return "grid gap-4 @sm:grid-cols-2 @2xl:grid-cols-[repeat(var(--per),minmax(0,1fr))]";
  if (perRow === 2) return "grid gap-4 @sm:grid-cols-2";
  return "grid gap-4";
}

/** Sorted by category, then name, with the uncategorised last. */
function byCategory<T>(items: T[], category: (item: T) => string | null, name: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const ca = category(a) ?? OTHER;
    const cb = category(b) ?? OTHER;
    if (ca !== cb) {
      if (ca === OTHER) return 1;
      if (cb === OTHER) return -1;
      return ca.localeCompare(cb, "fr");
    }
    return name(a).localeCompare(name(b), "fr");
  });
}

/**
 * The categories as buttons, a search when the list is long, and the pages.
 *
 * Shared by products and postings: a company with forty products and one with forty postings
 * have the same problem, and the visitor should meet the same answer to it.
 */
function useCatalog<T>(
  items: T[],
  perRow: number,
  category: (item: T) => string | null,
  name: (item: T) => string,
  text: (item: T) => string,
) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => byCategory(items, category, name), [items, category, name]);
  const categories = useMemo(
    () => [...new Set(sorted.map((item) => category(item) ?? OTHER))],
    [sorted, category],
  );

  const needle = query.trim().toLocaleLowerCase("fr");
  const filtered = sorted.filter(
    (item) =>
      (chosen === null || (category(item) ?? OTHER) === chosen) &&
      (!needle || text(item).toLocaleLowerCase("fr").includes(needle)),
  );

  // Three rows a page, and never fewer than six: one product a row still deserves a page that
  // shows more than three.
  const pageSize = Math.max(6, perRow * 3);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * pageSize, current * pageSize + pageSize);

  return {
    categories,
    chosen,
    choose: (value: string | null) => {
      setChosen(value);
      setPage(0);
    },
    query,
    search: (value: string) => {
      setQuery(value);
      setPage(0);
    },
    showSearch: items.length > pageSize,
    visible,
    total: filtered.length,
    page: current,
    pages,
    setPage,
  };
}

type Catalog = ReturnType<typeof useCatalog<unknown>>;

function CatalogControls({ catalog, label }: { catalog: Catalog; label: string }) {
  if (catalog.categories.length < 2 && !catalog.showSearch) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {catalog.categories.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Catégories">
          <Button
            type="button"
            size="sm"
            variant={catalog.chosen === null ? "default" : "outline"}
            onClick={() => catalog.choose(null)}
          >
            Toutes
          </Button>
          {catalog.categories.map((category) => (
            <Button
              key={category}
              type="button"
              size="sm"
              variant={catalog.chosen === category ? "default" : "outline"}
              onClick={() => catalog.choose(category)}
            >
              {category}
            </Button>
          ))}
        </div>
      )}

      {catalog.showSearch && (
        <div className="relative ml-auto w-full sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={catalog.query}
            onChange={(event) => catalog.search(event.target.value)}
            placeholder="Rechercher"
            aria-label={`Rechercher dans ${label}`}
            className="pl-8"
          />
        </div>
      )}
    </div>
  );
}

function Pagination({ catalog, onTurn }: { catalog: Catalog; onTurn: () => void }) {
  if (catalog.pages < 2) return null;

  const turn = (page: number) => {
    catalog.setPage(page);
    onTurn();
  };

  return (
    <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Pages">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={catalog.page === 0}
        onClick={() => turn(catalog.page - 1)}
      >
        <ChevronLeft className="size-4" />
        Précédente
      </Button>
      <span className="px-2 text-sm text-muted-foreground tabular-nums">
        Page {catalog.page + 1} sur {catalog.pages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={catalog.page >= catalog.pages - 1}
        onClick={() => turn(catalog.page + 1)}
      >
        Suivante
        <ChevronRight className="size-4" />
      </Button>
    </nav>
  );
}

/** A heading per category while all of them are shown, so a long list still reads in groups. */
function grouped<T>(items: T[], category: (item: T) => string | null, show: boolean) {
  const groups: { name: string | null; items: T[] }[] = [];
  for (const item of items) {
    const name = show ? (category(item) ?? OTHER) : null;
    const last = groups.at(-1);
    if (last && last.name === name) last.items.push(item);
    else groups.push({ name, items: [item] });
  }
  return groups;
}

function Heading({ s, children, icon }: { s: PublicPageStyleTokens; children?: React.ReactNode; icon?: React.ReactNode }) {
  if (!children) return null;
  return (
    <h2 className={cn(icon ? "flex items-center gap-2" : undefined, s.sectionTitle)}>
      {icon}
      {children}
    </h2>
  );
}

// ---- Products ----

const productCategory = (product: PublicProduct) => product.categoryName;
const productName = (product: PublicProduct) => product.title;
const productText = (product: PublicProduct) =>
  [product.title, product.description, product.categoryName, product.subCategoryName].filter(Boolean).join(" ");

function Price({ product, className }: { product: PublicProduct; className?: string }) {
  if (product.sellingPrice === null) return null;
  return (
    <p className={cn("font-semibold tabular-nums text-foreground", className)}>
      {product.variants.length > 0 && <span className="text-sm font-normal text-muted-foreground">À partir de </span>}
      {money.format(product.sellingPrice)}
      {product.unit && (
        <span className="text-sm font-normal text-muted-foreground">
          {" / "}
          {product.unit}
        </span>
      )}
    </p>
  );
}

function ProductCard({
  company,
  product,
  shape,
  s,
  onOpen,
  preview,
  showCategory,
}: {
  company: PublicCompany;
  product: PublicProduct;
  /** Off when the list already groups by category under headings. */
  showCategory: boolean;
  shape: PageItemShape;
  s: PublicPageStyleTokens;
  onOpen: () => void;
  preview: boolean;
}) {
  const round = shape === "Rond";
  const square = shape === "Carre";
  const isParent = product.variants.length > 0;

  const picture = product.imageUrl ? (
    /* Not next/image: a signed, short-lived link there is nothing to cache for. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={product.imageUrl}
      alt=""
      className={cn(
        "w-full object-cover",
        round ? "aspect-square rounded-full" : square ? "aspect-square" : "aspect-[4/3]",
      )}
    />
  ) : (
    <div
      className={cn(
        "flex w-full items-center justify-center bg-muted/50 text-muted-foreground",
        round ? "aspect-square rounded-full" : square ? "aspect-square" : "aspect-[4/3]",
      )}
      aria-hidden="true"
    >
      <ImageIcon className="size-6" />
    </div>
  );

  return (
    <li className={cn("relative flex flex-col", round ? "items-center text-center" : cn("overflow-hidden", s.card))}>
      <div className={cn(round ? "w-3/4" : "w-full")}>{picture}</div>

      <div className={cn("flex flex-1 flex-col", round ? "w-full pt-3" : "p-4", square && "p-3")}>
        {product.categoryName && showCategory && !round && (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {product.subCategoryName ? `${product.categoryName} · ${product.subCategoryName}` : product.categoryName}
          </p>
        )}
        <h3 className="mt-1 font-medium text-foreground">
          {/* The whole card opens the product, through this one button stretched over it, so
              the basket button on top of it stays a button of its own. */}
          <button
            type="button"
            onClick={preview ? undefined : onOpen}
            className="text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-ring"
            style={round ? { textAlign: "center" } : undefined}
          >
            {product.title}
          </button>
        </h3>
        {product.description && shape === "Rectangle" && (
          <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{product.description}</p>
        )}
        <Price product={product} className="mt-2 text-base" />

        {company.acceptsOrders && !preview && (
          <div className="relative z-10 mt-auto">
            {isParent ? (
              <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={onOpen}>
                Choisir
              </Button>
            ) : (
              <AddToBasketButton
                slug={company.slug}
                product={{ id: product.id, title: product.title, unit: product.unit, sellingPrice: product.sellingPrice }}
              />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/** A product's own window: every photograph, the whole description, and the choice of variant. */
function ProductDialog({
  company,
  product,
  onClose,
}: {
  company: PublicCompany;
  product: PublicProduct | null;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(0);
  const [variantId, setVariantId] = useState<string | null>(null);

  const variant = product?.variants.find((candidate) => candidate.id === variantId) ?? null;
  const image = product?.images[shown] ?? product?.images[0] ?? null;

  return (
    <Dialog
      open={product !== null}
      onOpenChange={(open) => {
        if (open) return;
        onClose();
        setShown(0);
        setVariantId(null);
      }}
    >
      {product && (
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{product.title}</DialogTitle>
            {product.categoryName && (
              <DialogDescription>
                {product.subCategoryName ? `${product.categoryName} · ${product.subCategoryName}` : product.categoryName}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 pb-4">
            {image && (
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.name ?? product.title} className="max-h-96 w-full rounded-lg object-contain bg-muted/30" />
                {image.name && <figcaption className="mt-1 text-center text-sm text-muted-foreground">{image.name}</figcaption>}
              </figure>
            )}

            {product.images.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {product.images.map((candidate, index) => (
                  <button
                    key={candidate.url}
                    type="button"
                    onClick={() => setShown(index)}
                    aria-label={candidate.name ?? `Photo ${index + 1}`}
                    aria-pressed={index === shown}
                    className={cn(
                      "size-16 overflow-hidden rounded-md border-2",
                      index === shown ? "border-primary" : "border-transparent",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={candidate.url} alt="" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {product.description && (
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{product.description}</p>
            )}

            {product.variants.length > 0 ? (
              <div>
                <p className="text-sm font-medium text-foreground">Choisissez</p>
                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Choix">
                  {product.variants.map((candidate) => (
                    <Button
                      key={candidate.id}
                      type="button"
                      role="radio"
                      aria-checked={candidate.id === variantId}
                      variant={candidate.id === variantId ? "default" : "outline"}
                      size="sm"
                      onClick={() => setVariantId(candidate.id)}
                    >
                      {variantLabel(product.title, candidate.title)}
                      {candidate.sellingPrice !== null && (
                        <span className="tabular-nums opacity-80">· {money.format(candidate.sellingPrice)}</span>
                      )}
                    </Button>
                  ))}
                </div>

                {variant ? (
                  <>
                    <p className="mt-3 text-lg font-semibold tabular-nums text-foreground">
                      {variant.sellingPrice !== null ? money.format(variant.sellingPrice) : "Prix sur demande"}
                      {variant.unit && <span className="text-sm font-normal text-muted-foreground"> / {variant.unit}</span>}
                    </p>
                    {company.acceptsOrders && (
                      <AddToBasketButton
                        slug={company.slug}
                        product={{
                          id: variant.id,
                          title: variant.title.toLocaleLowerCase("fr").startsWith(product.title.toLocaleLowerCase("fr"))
                            ? variant.title
                            : `${product.title} — ${variant.title}`,
                          unit: variant.unit,
                          sellingPrice: variant.sellingPrice,
                        }}
                      />
                    )}
                  </>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">Choisissez d&apos;abord une option pour voir son prix.</p>
                )}
              </div>
            ) : (
              <>
                <Price product={product} className="text-lg" />
                {company.acceptsOrders && (
                  <AddToBasketButton
                    slug={company.slug}
                    product={{ id: product.id, title: product.title, unit: product.unit, sellingPrice: product.sellingPrice }}
                  />
                )}
              </>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

/**
 * The products the company ticked as public, grouped by category, a page at a time, each
 * opening onto its own window.
 */
export function ProductCatalog({
  company,
  s,
  title = "Produits et services",
  perRow,
  shape = "Rectangle",
  preview = false,
}: {
  company: PublicCompany;
  s: PublicPageStyleTokens;
  title?: string | null;
  perRow: number;
  shape?: PageItemShape;
  /** In the builder: nothing opens and nothing goes in a basket. */
  preview?: boolean;
}) {
  const top = useRef<HTMLElement>(null);
  const catalog = useCatalog(company.products, perRow, productCategory, productName, productText);
  const [open, setOpen] = useState<PublicProduct | null>(null);

  if (company.products.length === 0) return null;

  return (
    <section ref={top} className="@container scroll-mt-20">
      <Heading s={s}>{title}</Heading>
      <CatalogControls catalog={catalog as Catalog} label="les produits" />

      {catalog.total === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Aucun produit ne correspond.</p>
      ) : (
        grouped(catalog.visible, productCategory, catalog.chosen === null && catalog.categories.length > 1).map((group, index, groups) => (
          <div key={`${group.name}-${index}`} className="mt-4">
            {group.name && <h3 className="mb-3 text-sm font-semibold text-foreground">{group.name}</h3>}
            <ul className={itemsGridClass(perRow)} style={{ "--per": perRow } as React.CSSProperties}>
              {group.items.map((product) => (
                <ProductCard
                  key={product.id}
                  company={company}
                  product={product}
                  shape={shape}
                  s={s}
                  preview={preview}
                  showCategory={groups.length === 1 && group.name === null && catalog.categories.length < 2}
                  onOpen={() => setOpen(product)}
                />
              ))}
            </ul>
          </div>
        ))
      )}

      <Pagination catalog={catalog as Catalog} onTurn={() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
      {!preview && <ProductDialog company={company} product={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

// ---- Postings ----

const jobCategory = (job: PublicJob) => job.category;
const jobName = (job: PublicJob) => job.title;
const jobText = (job: PublicJob) => [job.title, job.description, job.location, job.category].filter(Boolean).join(" ");

function jobMeta(job: PublicJob) {
  return [employmentTypeLabels[job.employmentType], job.location, job.compensation].filter(Boolean).join(" · ");
}

function JobCard({
  job,
  shape,
  s,
  onOpen,
  preview,
}: {
  job: PublicJob;
  shape: PageItemShape;
  s: PublicPageStyleTokens;
  onOpen: () => void;
  preview: boolean;
}) {
  const opener = (
    <button
      type="button"
      onClick={preview ? undefined : onOpen}
      className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-ring"
    >
      {job.title}
    </button>
  );

  if (shape === "Rectangle") {
    return (
      <li className={cn("relative p-4 sm:p-5", s.card)}>
        <h3 className="text-base font-medium text-foreground">{opener}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{jobMeta(job)}</p>
        {job.description && (
          <p className="mt-3 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {job.description}
          </p>
        )}
        <p className="mt-3 text-sm font-medium text-primary">Voir l&apos;offre</p>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "relative flex aspect-square flex-col items-center justify-center gap-2 p-4 text-center",
        shape === "Rond" ? "rounded-full border border-border bg-card" : s.card,
      )}
    >
      <BriefcaseBusiness className="size-6 text-primary" aria-hidden="true" />
      <h3 className="line-clamp-3 text-base font-medium text-foreground">{opener}</h3>
      <p className="line-clamp-2 text-xs text-muted-foreground">{jobMeta(job)}</p>
    </li>
  );
}

/** A posting's own window: the whole advertisement, its documents, and the way to apply. */
function JobDialog({ slug, job, onClose }: { slug: string; job: PublicJob | null; onClose: () => void }) {
  return (
    <Dialog open={job !== null} onOpenChange={(open) => !open && onClose()}>
      {job && (
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{job.title}</DialogTitle>
            <DialogDescription>{jobMeta(job)}</DialogDescription>
          </DialogHeader>

          <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 pb-4">
            {job.description && (
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{job.description}</p>
            )}

            {job.documents.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {job.documents.map((document) => (
                  <li key={document.id}>
                    {document.url ? (
                      <a
                        href={document.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm text-foreground hover:bg-accent"
                      >
                        <FileText className="size-4 shrink-0" aria-hidden="true" />
                        {document.label}
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-sm text-muted-foreground">
                        <FileText className="size-4 shrink-0" aria-hidden="true" />
                        {document.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <JobApplicationDialog slug={slug} jobId={job.id} jobTitle={job.title} />

            {job.applyTo && (
              <p className="text-sm text-foreground">
                <span className="text-muted-foreground">Ou écrivez à : </span>
                {job.applyTo}
              </p>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

/** The positions being advertised, grouped by category, a page at a time. */
export function JobCatalog({
  company,
  s,
  title = "Nous embauchons",
  perRow = 1,
  shape = "Rectangle",
  preview = false,
}: {
  company: PublicCompany;
  s: PublicPageStyleTokens;
  title?: string | null;
  perRow?: number;
  shape?: PageItemShape;
  preview?: boolean;
}) {
  const top = useRef<HTMLElement>(null);
  const catalog = useCatalog(company.jobs, perRow, jobCategory, jobName, jobText);
  const [open, setOpen] = useState<PublicJob | null>(null);

  if (company.jobs.length === 0) return null;

  return (
    <section ref={top} className="@container scroll-mt-20">
      <Heading s={s} icon={title ? <BriefcaseBusiness className="size-5 shrink-0" aria-hidden="true" /> : undefined}>
        {title}
      </Heading>
      <CatalogControls catalog={catalog as Catalog} label="les offres" />

      {catalog.total === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Aucune offre ne correspond.</p>
      ) : (
        grouped(catalog.visible, jobCategory, catalog.chosen === null && catalog.categories.length > 1).map((group, index) => (
          <div key={`${group.name}-${index}`} className="mt-4">
            {group.name && <h3 className="mb-3 text-sm font-semibold text-foreground">{group.name}</h3>}
            <ul className={itemsGridClass(perRow)} style={{ "--per": perRow } as React.CSSProperties}>
              {group.items.map((job) => (
                <JobCard key={job.id} job={job} shape={shape} s={s} preview={preview} onOpen={() => setOpen(job)} />
              ))}
            </ul>
          </div>
        ))
      )}

      <Pagination catalog={catalog as Catalog} onTurn={() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
      {!preview && <JobDialog slug={company.slug} job={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
