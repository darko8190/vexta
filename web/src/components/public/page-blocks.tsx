import { BriefcaseBusiness, ClipboardPen, FileText, Mail, MapPin, Phone } from "lucide-react";
import { AddToBasketButton } from "@/components/public/basket-panel";
import { JobApplicationDialog } from "@/components/public/job-application-dialog";
import { PublicFormDialog } from "@/components/public/public-form-dialog";
import { employmentTypeLabels, formKindLabels } from "@/lib/labels";
import type { PublicPageStyleTokens } from "@/lib/public-page-style";
import type { PublicCompany, PublicSection } from "@/lib/types";
import { cn } from "@/lib/utils";

const money = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" });

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

/**
 * How many across, on screens wide enough for it.
 *
 * Always one column on a telephone, whatever was chosen. That is not a compromise: two columns
 * of text at 375px is a column of two words, and a company that could produce that would.
 */
export function columnsClass(columns: number): string {
  if (columns >= 3) return "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";
  if (columns === 2) return "grid gap-4 sm:grid-cols-2";
  return "grid gap-4";
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

/** A band of text the company placed itself, laid out in one, two or three columns. */
export function TextBlock({
  s,
  title,
  text,
  columns,
}: {
  s: PublicPageStyleTokens;
  title: string | null;
  text: string;
  columns: number;
}) {
  return (
    <section>
      <Heading s={s}>{title}</Heading>
      <div
        className={cn(
          "mt-3 whitespace-pre-line text-base leading-relaxed text-muted-foreground",
          // CSS columns rather than a grid: the text is one piece and should flow between the
          // columns, not be cut into equal blocks that read out of order.
          columns >= 3 ? "sm:columns-2 lg:columns-3" : columns === 2 ? "sm:columns-2" : "max-w-prose",
          columns > 1 ? "gap-8" : undefined,
        )}
      >
        {text}
      </div>
    </section>
  );
}

/** One photograph, the full width of the page. */
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
  section,
}: {
  s: PublicPageStyleTokens;
  title: string | null;
  section: PublicSection;
}) {
  return (
    <section>
      <Heading s={s}>{title}</Heading>

      <ul className={cn("mt-4", columnsClass(section.columns))}>
        {section.images.map((image) => (
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

/** The products the company ticked as public, with the basket when it takes orders. */
export function ProductsBlock({
  company,
  s,
  title = "Produits et services",
  columns,
}: BlockProps & { columns?: number }) {
  if (company.products.length === 0) return null;

  return (
    <section>
      <Heading s={s}>{title}</Heading>

      <ul className={cn("mt-4", columns ? columnsClass(columns) : s.productGrid)}>
        {company.products.map((product) => (
          <li key={product.id} className={cn("flex flex-col overflow-hidden", s.card)}>
            {product.imageUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={product.imageUrl}
                alt={product.title}
                className="aspect-[4/3] w-full object-cover"
              />
            )}

            <div className="flex flex-1 flex-col p-4">
              {product.categoryName && (
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {product.categoryName}
                </p>
              )}
              <h3 className="mt-1 font-medium text-foreground">{product.title}</h3>
              {product.description && (
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                  {product.description}
                </p>
              )}
              {product.sellingPrice !== null && (
                <p className="mt-3 text-base font-semibold tabular-nums text-foreground">
                  {money.format(product.sellingPrice)}
                  {/* The unit beside the figure, because "12,50 $" for a square foot and for a
                      pallet are very different offers. */}
                  {product.unit && (
                    <span className="text-sm font-normal text-muted-foreground">
                      {" / "}
                      {product.unit}
                    </span>
                  )}
                </p>
              )}

              {/* mt-auto on the wrapper, not the button: a grid of cards whose descriptions are
                  different lengths should still line its buttons up along the bottom. */}
              {company.acceptsOrders && (
                <div className="mt-auto">
                  <AddToBasketButton
                    slug={company.slug}
                    product={{
                      id: product.id,
                      title: product.title,
                      unit: product.unit,
                      sellingPrice: product.sellingPrice,
                    }}
                  />
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The positions being advertised, each with whatever was hung on it. */
export function JobsBlock({ company, s, title = "Nous embauchons" }: BlockProps) {
  if (company.jobs.length === 0) return null;

  return (
    <section>
      <Heading s={s} icon={<BriefcaseBusiness className="size-5 shrink-0" aria-hidden="true" />}>
        {title}
      </Heading>

      <ul className="mt-4 space-y-4">
        {company.jobs.map((job) => (
          <li key={job.id} className={cn(s.card, "p-4 sm:p-5")}>
            <h3 className="text-base font-medium text-foreground">{job.title}</h3>

            <p className="mt-1 text-sm text-muted-foreground">
              {[employmentTypeLabels[job.employmentType], job.location, job.compensation]
                .filter(Boolean)
                .join(" · ")}
            </p>

            {job.description && (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {job.description}
              </p>
            )}

            {job.documents.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
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
                      /* Storage could not be reached. The attachment is named rather than
                         hidden: a visitor who was told about a document and cannot find it is
                         better served than one who never saw it. */
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-sm text-muted-foreground">
                        <FileText className="size-4 shrink-0" aria-hidden="true" />
                        {document.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Offered on every published posting, with or without a form attached: the CV is
                the application, and the form is only the company's extra questions. The line the
                company wrote stays beside it, because some people would rather telephone -- but
                it is no longer the only way in. */}
            <JobApplicationDialog slug={company.slug} jobId={job.id} jobTitle={job.title} />

            {job.applyTo && (
              <p className="mt-3 text-sm text-foreground">
                <span className="text-muted-foreground">Ou écrivez à : </span>
                {job.applyTo}
              </p>
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
    company.email || company.phone || company.contactNote?.trim() || lines.length > 0,
  );

  if (!hasAnything) return null;

  return (
    <footer className="mt-12 border-t border-border sm:mt-16">
      <div className={cn(s.container, "py-10 sm:py-14")}>
        <h2 className={s.sectionTitle}>Nous joindre</h2>

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
      </div>
    </footer>
  );
}

/**
 * One band the company placed, drawn as whatever it holds.
 *
 * A section whose content has gone is not reached here: the API drops it rather than sending a
 * heading over nothing. What remains is a straight translation from a kind to a block.
 */
export function SectionBand({
  section,
  company,
  s,
}: {
  section: PublicSection;
  company: PublicCompany;
  s: PublicPageStyleTokens;
}) {
  switch (section.kind) {
    case "Texte":
      return section.text ? (
        <TextBlock s={s} title={section.title} text={section.text} columns={section.columns} />
      ) : null;

    case "Galerie":
      return <GalleryBlock s={s} title={section.title} section={section} />;

    case "Image":
      return section.imageUrl ? (
        <ImageBlock s={s} title={section.title} url={section.imageUrl} />
      ) : null;

    case "Produits":
      return <ProductsBlock company={company} s={s} title={section.title} columns={section.columns} />;

    case "Emplois":
      return <JobsBlock company={company} s={s} title={section.title} />;

    case "Formulaires":
      return <FormsBlock company={company} s={s} title={section.title} />;

    default:
      // A kind this build does not recognise, from a newer API. Nothing is drawn, rather than a
      // frame that says a word nobody here can read.
      return null;
  }
}
