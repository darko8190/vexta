import { cache, Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Building2, BriefcaseBusiness, FileText, Mail, MapPin, Phone } from "lucide-react";
import { BrandTheme } from "@/components/layout/brand-theme";
import { JobApplicationDialog } from "@/components/public/job-application-dialog";
import { PublicAccountBar } from "@/components/public/public-account-bar";
import { apiFetch } from "@/lib/api-server";
import { employmentTypeLabels } from "@/lib/labels";
import { styleTokensFor } from "@/lib/public-page-style";
import type { PublicCompany } from "@/lib/types";
import { cn } from "@/lib/utils";

const money = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" });

/**
 * One fetch per request, shared by the metadata and the page.
 *
 * `cache` rather than Next's own fetch deduplication: the call is deliberately uncached — a
 * company that publishes a correction expects to see it — and an uncached fetch is not deduped,
 * so without this the API would answer the same question twice for every visitor.
 */
const loadCompany = cache(async (slug: string): Promise<PublicCompany | null> => {
  const response = await apiFetch(`/api/public/companies/${encodeURIComponent(slug)}`, {
    timeoutMs: 5_000,
  });

  // Unknown slug, and unpublished page, are the same answer from the API on purpose. Anything
  // else that goes wrong lands here too: a stranger has no account to sign into and no way to
  // act on "the service is down", so they are told the page is not there rather than shown a
  // failure that belongs to us.
  if (!response.ok) return null;

  try {
    return (await response.json()) as PublicCompany;
  } catch {
    return null;
  }
});

function addressLines(company: PublicCompany): string[] {
  const address = company.address;
  if (!address) return [];

  return [
    [address.line1, address.line2].filter(Boolean).join(", "),
    [address.city, address.province].filter(Boolean).join(", "),
    [address.postalCode, address.country].filter(Boolean).join(", "),
  ].filter((line) => line.length > 0);
}

export async function generateMetadata({ params }: PageProps<"/e/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const company = await loadCompany(slug);

  if (!company) return { title: "Page introuvable" };

  const description =
    company.headline?.trim() ||
    company.about?.trim().slice(0, 160) ||
    `Page de ${company.name}.`;

  return {
    title: company.name,
    description,
    openGraph: { title: company.name, description },
  };
}

/**
 * What a visitor sees while the company's own page is still being fetched.
 *
 * Grey rather than painted: the colour arrives with the data, and a band that changes hue once
 * the request lands is worse than one that was neutral all along.
 */
function PageFallback() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-1.5 w-full bg-border" aria-hidden="true" />
      <div className="border-b border-border">
        <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
            <div className="size-20 shrink-0 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
            <div className="w-full space-y-3">
              <div className="h-7 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The page itself is synchronous and the request-time work sits behind a boundary. Cache
 * Components refuses to prerender a route that awaits `params` or an uncached fetch at the top
 * level, and the visitor gets the shell straight away instead of a blank document.
 */
export default function PublicCompanyPage({ params }: PageProps<"/e/[slug]">) {
  return (
    <Suspense fallback={<PageFallback />}>
      <CompanyPageContent params={params} />
    </Suspense>
  );
}

async function CompanyPageContent({ params }: Pick<PageProps<"/e/[slug]">, "params">) {
  const { slug } = await params;
  const company = await loadCompany(slug);

  if (!company) notFound();

  const lines = addressLines(company);
  const hasContact = Boolean(company.email || company.phone || company.contactNote || lines.length > 0);
  const hasAbout = Boolean(company.about?.trim());
  const hasProducts = company.products.length > 0;
  const hasJobs = company.jobs.length > 0;

  // A company that turned the page on and wrote nothing still gets a page that looks chosen:
  // its name, and one honest line instead of a screen of empty headings.
  const isBare = !hasAbout && !hasProducts && !hasJobs && !hasContact;

  // Which of the four arrangements this company chose. Resolved once: every class name below
  // comes from it, and a style this build does not recognise falls back rather than failing.
  const s = styleTokensFor(company.style);

  return (
    <>
      {/* Before anything else, so the first paint is already in the company's colour. */}
      <BrandTheme color={company.brandColor} />

      <div className="min-h-screen bg-background">
        {/* A band of the company's colour, which is the whole of the branding: enough to make
            the page theirs, not enough to make the text hard to read. Its weight is the one
            thing the chosen arrangement changes about it. */}
        <div className={s.accentBar} aria-hidden="true" />

        <header className={s.header}>
          {/* Above the company's own header and outside it: this belongs to Vexta, not to the
              company, and it must not take on whichever arrangement the company chose. */}
          <div className={cn(s.container, "flex items-center justify-end gap-2 pt-3")}>
            <PublicAccountBar slug={company.slug} />
          </div>

          <div className={cn(s.container, "py-10 sm:py-14")}>
            <div className={s.headerInner}>
              <div className={s.logoFrame}>
                {company.logoETag ? (
                  /* Not next/image: the bytes come from our own anonymous logo route with an
                     ETag that already busts the cache. */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/company/${company.tenantId}/logo?v=${company.logoETag}`}
                    alt={`Logo de ${company.name}`}
                    className="size-full object-contain p-2"
                  />
                ) : (
                  <Building2 className="size-8 text-muted-foreground" aria-hidden="true" />
                )}
              </div>

              <div className={cn(s.headerText, "flex-1")}>
                <h1 className={s.title}>
                  {company.name}
                </h1>
                {/* No fallback line here: the accroche is what the name is not, and when there
                    is none the h1 above is already the one thing across the top. */}
                {company.headline?.trim() && (
                  <p className={s.headline}>
                    {company.headline.trim()}
                  </p>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className={cn(s.container, "py-10 sm:py-14")}>
          {isBare && (
            <p className="text-base text-muted-foreground">
              {company.name} n&apos;a encore rien publié sur cette page. Revenez bientôt.
            </p>
          )}

          <div className={s.sectionGap}>
            {hasAbout && (
              <section>
                <h2 className={s.sectionTitle}>À propos</h2>
                {/* whitespace-pre-line: the paragraphs are typed in a textarea, and the line
                    breaks the owner put there are the only structure the text has. */}
                <p className="mt-3 max-w-prose whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                  {company.about}
                </p>
              </section>
            )}

            {hasProducts && (
              <section>
                <h2 className={s.sectionTitle}>Produits et services</h2>

                <ul className={cn("mt-4", s.productGrid)}>
                  {company.products.map((product) => (
                    <li key={product.id} className={cn("flex flex-col overflow-hidden", s.card)}>
                      {product.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
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
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {hasJobs && (
              <section>
                <h2 className={cn("flex items-center gap-2", s.sectionTitle)}>
                  <BriefcaseBusiness className="size-5 shrink-0" aria-hidden="true" />
                  Nous embauchons
                </h2>

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
                                /* Storage could not be reached. The attachment is named rather
                                   than hidden: a visitor who was told about a document and
                                   cannot find it is better served than one who never saw it. */
                                <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-sm text-muted-foreground">
                                  <FileText className="size-4 shrink-0" aria-hidden="true" />
                                  {document.label}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Offered on every published posting, with or without a form attached:
                          the CV is the application, and the form is only the company's extra
                          questions. The line the company wrote stays beside it, because some
                          people would rather telephone -- but it is no longer the only way in. */}
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
            )}

            {hasContact && (
              <section>
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
                          <a
                            href={`mailto:${company.email}`}
                            className="text-foreground hover:underline"
                          >
                            {company.email}
                          </a>
                        </dd>
                      </div>
                    </div>
                  )}
                </dl>
              </section>
            )}
          </div>
        </main>

      </div>
    </>
  );
}
