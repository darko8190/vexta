import { ClipboardPen, Mail, MapPin, Phone } from "lucide-react";
import { itemsGridClass, JobCatalog, ProductCatalog } from "@/components/public/catalog";
import { PublicFormDialog } from "@/components/public/public-form-dialog";
import { PublicFormInline } from "@/components/public/public-form-inline";
import { formKindLabels } from "@/lib/labels";
import type { PublicPageStyleTokens } from "@/lib/public-page-style";
import type {
  PageSectionBackground,
  PublicCell,
  PublicCompany,
  PublicGalleryImage,
  PublicSection,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export { JobCatalog, ProductCatalog };

/**
 * The bands a public page is made of.
 *
 * Pulled out of the page itself the day the page stopped being one fixed order. A company that
 * has arranged its own sections and one that has not now draw from the same set, which is the
 * only way the two can keep agreeing about what a product card looks like.
 *
 * Every block takes the chosen arrangement's tokens rather than reaching for its own classes,
 * so a company picking Chantier gets Chantier everywhere, including in the bands it placed
 * itself.
 */
interface BlockProps {
  company: PublicCompany;
  s: PublicPageStyleTokens;
  /** Printed above the block. Null leaves the block without a heading. */
  title?: string | null;
}

/** A heading, or nothing at all when there is none to print. */
function Heading({ s, children, icon }: { s: PublicPageStyleTokens; children?: React.ReactNode; icon?: React.ReactNode }) {
  if (!children) return null;

  return (
    <h2 className={cn(icon ? "flex items-center gap-2" : undefined, s.sectionTitle)}>
      {icon}
      {children}
    </h2>
  );
}

/** The paragraphs the company wrote about itself. */
export function AboutBlock({ company, s, title = "À propos" }: BlockProps) {
  if (!company.about?.trim()) return null;

  return (
    <section>
      <Heading s={s}>{title}</Heading>
      {/* whitespace-pre-line: the paragraphs are typed in a textarea, and the line breaks the
          owner put there are the only structure the text has. */}
      <p className="mt-3 max-w-prose whitespace-pre-line text-base leading-relaxed text-muted-foreground">
        {company.about}
      </p>
    </section>
  );
}

/** A column of text the company placed itself. */
export function TextBlock({
  s,
  title,
  text,
}: {
  s: PublicPageStyleTokens;
  title: string | null;
  text: string;
}) {
  return (
    <section>
      <Heading s={s}>{title}</Heading>
      <div className={cn("max-w-prose whitespace-pre-line text-base leading-relaxed text-muted-foreground", title ? "mt-3" : undefined)}>
        {text}
      </div>
    </section>
  );
}

/** One photograph, the width of its column. */
export function ImageBlock({
  s,
  title,
  url,
}: {
  s: PublicPageStyleTokens;
  title: string | null;
  url: string;
}) {
  return (
    <section>
      <Heading s={s}>{title}</Heading>
      {/* Not next/image: the link is signed, short-lived and already unique, so there is
          nothing for an optimiser to cache. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={title ?? ""}
        className={cn("w-full object-cover", title ? "mt-4" : undefined, s.card)}
      />
    </section>
  );
}

/** One of the company's galleries, as a grid of photographs with their captions. */
export function GalleryBlock({
  s,
  title,
  images,
  perRow,
}: {
  s: PublicPageStyleTokens;
  title: string | null;
  images: PublicGalleryImage[];
  perRow: number;
}) {
  if (images.length === 0) return null;

  return (
    <section className="@container">
      <Heading s={s}>{title}</Heading>

      <ul className={cn(title ? "mt-4" : undefined, itemsGridClass(perRow))} style={{ "--per": perRow } as React.CSSProperties}>
        {images.map((image) => (
          <li key={image.id} className={cn("overflow-hidden", s.card)}>
            {image.url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={image.url}
                alt={image.caption ?? ""}
                className="aspect-[4/3] w-full object-cover"
              />
            ) : (
              /* Storage could not be reached for this one. A frame rather than a gap, so a
                 grid of six does not silently become a grid of five. */
              <div className="aspect-[4/3] w-full bg-muted/40" aria-hidden="true" />
            )}

            {image.caption && (
              <p className="p-3 text-sm text-muted-foreground">{image.caption}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The forms the company ticked for its page. */
export function FormsBlock({ company, s, title = "Nous écrire" }: BlockProps) {
  if (company.forms.length === 0) return null;

  return (
    <section>
      <Heading s={s} icon={<ClipboardPen className="size-5 shrink-0" aria-hidden="true" />}>
        {title}
      </Heading>

      <ul className="mt-4 space-y-4">
        {company.forms.map((form) => (
          <li
            key={form.id}
            id={`formulaire-${form.id}`}
            className={cn(s.card, "flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5")}
          >
            <div className="min-w-0">
              <h3 className="text-base font-medium text-foreground">{form.title}</h3>

              {/* The kind named only when it says something a visitor can act on. A quote
                  request and a vehicle sheet are answered in different frames of mind;
                  "Formulaire" is a word that earns nothing. */}
              {form.kind !== "Defaut" && (
                <p className="mt-0.5 text-sm text-muted-foreground">{formKindLabels[form.kind]}</p>
              )}

              {form.description && (
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {form.description}
                </p>
              )}
            </div>

            <PublicFormDialog slug={company.slug} form={form} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * How to reach the company, at the foot of every page.
 *
 * Fixed, and below whatever the company arranged. It is the one thing every visitor is actually
 * looking for, and a page builder that let somebody bury it — or leave it out — would be a
 * builder that lets a company fail at the only job its page has.
 */
export function ContactFooter({
  company,
  s,
  lines,
}: {
  company: PublicCompany;
  s: PublicPageStyleTokens;
  lines: string[];
}) {
  const hasAnything = Boolean(
    company.email ||
      company.phone ||
      company.contactNote?.trim() ||
      company.footerText?.trim() ||
      lines.length > 0,
  );

  if (!hasAnything) return null;

  return (
    <footer className="mt-12 border-t border-border sm:mt-16">
      <div className={cn(s.container, "py-10 sm:py-14")}>
        <h2 className={s.sectionTitle}>{company.footerTitle?.trim() || "Nous joindre"}</h2>

        {company.contactNote?.trim() && (
          <p className="mt-3 max-w-prose whitespace-pre-line text-base leading-relaxed text-muted-foreground">
            {company.contactNote}
          </p>
        )}

        <dl className="mt-4 grid gap-5 sm:grid-cols-2">
          {lines.length > 0 && (
            <div className="flex gap-3">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <dt className="text-sm text-muted-foreground">Adresse</dt>
                <dd className="mt-0.5 text-sm text-foreground">
                  {lines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </dd>
              </div>
            </div>
          )}

          {company.phone && (
            <div className="flex gap-3">
              <Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-sm text-muted-foreground">Téléphone</dt>
                <dd className="mt-0.5 text-sm">
                  <a href={`tel:${company.phone}`} className="text-foreground hover:underline">
                    {company.phone}
                  </a>
                </dd>
              </div>
            </div>
          )}

          {company.email && (
            <div className="flex gap-3">
              <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-sm text-muted-foreground">Courriel</dt>
                <dd className="mt-0.5 truncate text-sm">
                  <a href={`mailto:${company.email}`} className="text-foreground hover:underline">
                    {company.email}
                  </a>
                </dd>
              </div>
            </div>
          )}
        </dl>

        {company.footerText?.trim() && (
          <p className="mt-8 border-t border-border pt-4 text-xs whitespace-pre-line text-muted-foreground">
            {company.footerText.trim()}
          </p>
        )}
      </div>
    </footer>
  );
}

/**
 * How many columns side by side, measured on the page's own width. One on a telephone, two on
 * a tablet, all of them once there is room. Every class written out in full, so the stylesheet
 * generator can find it.
 */
export function cellsGridClass(columns: number): string {
  if (columns >= 2) return "grid gap-8 @xl:grid-cols-2 @3xl:grid-cols-[repeat(var(--cols),minmax(0,1fr))]";
  return "grid gap-8";
}

export const backgroundClass: Record<PageSectionBackground, string> = {
  Aucun: "",
  Doux: "rounded-xl bg-muted/50 p-5 sm:p-8",
  Couleur: "rounded-xl border border-primary/20 bg-primary/10 p-5 sm:p-8",
};

/** One column, drawn as whatever it holds. */
export function CellBlock({
  cell,
  company,
  s,
  preview = false,
}: {
  cell: PublicCell;
  company: PublicCompany;
  s: PublicPageStyleTokens;
  preview?: boolean;
}) {
  switch (cell.kind) {
    case "Texte":
      return cell.text ? <TextBlock s={s} title={cell.title} text={cell.text} /> : null;

    case "Galerie":
      return <GalleryBlock s={s} title={cell.title} images={cell.images} perRow={cell.itemsPerRow} />;

    case "Image":
      return cell.imageUrl ? <ImageBlock s={s} title={cell.title} url={cell.imageUrl} /> : null;

    case "Produits":
      return (
        <ProductCatalog
          company={company}
          s={s}
          title={cell.title}
          perRow={cell.itemsPerRow}
          shape={cell.shape}
          preview={preview}
        />
      );

    case "Emplois":
      return (
        <JobCatalog
          company={company}
          s={s}
          title={cell.title}
          perRow={cell.itemsPerRow}
          shape={cell.shape}
          preview={preview}
        />
      );

    case "Formulaires":
      return <FormsBlock company={company} s={s} title={cell.title} />;

    case "Formulaire":
      return cell.form ? (
        <section>
          <Heading s={s}>{cell.title}</Heading>
          <PublicFormInline
            slug={company.slug}
            form={cell.form}
            preview={preview}
            className={cn(s.card, "p-4 sm:p-5", cell.title ? "mt-4" : undefined)}
          />
        </section>
      ) : null;

    default:
      // A kind this build does not recognise, from a newer API.
      return null;
  }
}

/** One band the company placed: its heading, then its columns side by side. */
export function SectionBand({
  section,
  company,
  s,
}: {
  section: PublicSection;
  company: PublicCompany;
  s: PublicPageStyleTokens;
}) {
  const columns = Math.max(1, section.cells.length);

  return (
    <section className={cn("@container", backgroundClass[section.background] ?? "")}>
      <Heading s={s}>{section.title}</Heading>
      <div
        className={cn(cellsGridClass(columns), section.title ? "mt-4" : undefined)}
        style={{ "--cols": columns } as React.CSSProperties}
      >
        {section.cells.map((cell, index) => (
          <div key={index} className="min-w-0">
            <CellBlock cell={cell} company={company} s={s} />
          </div>
        ))}
      </div>
    </section>
  );
}
