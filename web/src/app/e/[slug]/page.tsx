import { cache, Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Building2 } from "lucide-react";
import { BrandTheme } from "@/components/layout/brand-theme";
import { BasketPanel } from "@/components/public/basket-panel";
import {
  AboutBlock,
  ContactFooter,
  FormsBlock,
  JobsBlock,
  ProductsBlock,
  SectionBand,
} from "@/components/public/page-blocks";
import { PublicAccountBar } from "@/components/public/public-account-bar";
import { apiFetch } from "@/lib/api-server";
import { styleTokensFor } from "@/lib/public-page-style";
import type { PublicCompany } from "@/lib/types";
import { cn } from "@/lib/utils";

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

  // Whether this company arranged its own middle. Everything below turns on it, and a company
  // that never opened the builder has none -- which is the fallback, not a special case.
  const hasBuilt = company.sections.length > 0;

  const hasAnything =
    hasBuilt ||
    Boolean(company.about?.trim()) ||
    company.products.length > 0 ||
    company.jobs.length > 0 ||
    company.forms.length > 0;

  // A company that turned the page on and wrote nothing still gets a page that looks chosen:
  // its name, and one honest line instead of a screen of empty headings.
  const isBare = !hasAnything && !hasContact;

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
            {hasBuilt ? (
              // What the company arranged, in its order. Nothing is added to it and nothing is
              // hidden from it: a page somebody built is a page they are responsible for.
              company.sections.map((section) => (
                <SectionBand key={section.id} section={section} company={company} s={s} />
              ))
            ) : (
              // The arrangement Vexta has always drawn, for a company that never opened the
              // builder. This is what makes the builder safe to ship: nobody's page changes
              // until they decide to build one.
              <>
                <AboutBlock company={company} s={s} />
                <ProductsBlock company={company} s={s} />
                <JobsBlock company={company} s={s} />
                <FormsBlock company={company} s={s} />
              </>
            )}
          </div>
        </main>

        {/* Fixed, and below whatever the company arranged. It is the one thing every visitor
            is actually looking for, and a builder that let somebody bury it would be a builder
            that lets a company fail at the only job its page has. */}
        <ContactFooter company={company} s={s} lines={lines} />

        {/* Outside the main column and after it: a basket is the visitor's, not the company's,
            and it must not take on whichever arrangement the page is drawn with. */}
        {company.acceptsOrders && (
          <BasketPanel slug={company.slug} companyName={company.name} />
        )}
      </div>
    </>
  );
}
