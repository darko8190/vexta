"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Building2, Briefcase, Package, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PageHeader } from "@/components/layout/page-header";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { useDirectoryCompaniesQuery } from "@/hooks/use-directory";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

/**
 * Every company on Vexta with a page anybody can open.
 *
 * Pattern: List / Index. One job on this URL — find a company — so the page is a search box and
 * a grid of cards, and nothing else competes with them.
 *
 * A company that has taken its page offline is not here. That is the same rule its own page
 * follows, and the directory would otherwise be a list of links that lead to a 404.
 */
export default function CompaniesDirectoryPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search, 300);

  const { data, isLoading, isError, error, refetch } = useDirectoryCompaniesQuery(debounced, page);

  const companies = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Entreprises"
        description="Les entreprises qui publient une page sur Vexta."
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            // Back to the first page: staying on page four of a result set that no longer has
            // four pages is a screen that answers with nothing and explains nothing.
            setPage(1);
          }}
          placeholder="Nom, ville, description…"
          aria-label="Rechercher une entreprise"
          className="pl-9"
        />
      </div>

      {isLoading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState error={error} onRetry={() => void refetch()} />
      ) : companies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={debounced ? "Aucun résultat" : "Aucune entreprise publiée"}
          description={
            debounced
              ? "Essayez un autre mot, ou une ville."
              : "Les entreprises qui publient leur page apparaîtront ici."
          }
        />
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {companies.map((company) => (
              <li key={company.slug}>
                <Link
                  href={`/e/${company.slug}`}
                  className="flex h-full gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/40"
                >
                  {company.logoETag ? (
                    <Image
                      src={`/api/company/${company.tenantId}/logo?v=${company.logoETag}`}
                      alt=""
                      width={40}
                      height={40}
                      className="size-10 shrink-0 rounded object-contain"
                      unoptimized
                    />
                  ) : (
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded text-sm font-semibold text-white"
                      style={{ backgroundColor: company.brandColor ?? "var(--primary)" }}
                      aria-hidden
                    >
                      {company.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}

                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{company.name}</p>
                    {company.city && (
                      <p className="truncate text-sm text-muted-foreground">
                        {company.city}
                        {company.province ? `, ${company.province}` : ""}
                      </p>
                    )}
                    {company.headline && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {company.headline}
                      </p>
                    )}

                    {/* What is actually there to go and see. A count of zero is left out
                        rather than printed: it is an answer nobody is looking for. */}
                    {(company.openJobs > 0 || company.publicProducts > 0) && (
                      <p className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {company.openJobs > 0 && (
                          <span className="flex items-center gap-1">
                            <Briefcase className="size-3.5" />
                            {company.openJobs} offre{company.openJobs > 1 ? "s" : ""}
                          </span>
                        )}
                        {company.publicProducts > 0 && (
                          <span className="flex items-center gap-1">
                            <Package className="size-3.5" />
                            {company.publicProducts} produit{company.publicProducts > 1 ? "s" : ""}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <PaginationBar result={data} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
