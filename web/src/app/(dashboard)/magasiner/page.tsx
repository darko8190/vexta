"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Package, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PageHeader } from "@/components/layout/page-header";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { useDirectoryProductsQuery, useDirectorySummaryQuery } from "@/hooks/use-directory";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatAmount } from "@/lib/money";

/**
 * Everything the companies on Vexta have put in their shop window.
 *
 * Pattern: List / Index, laid out as a grid because what is being scanned is photographs and
 * prices rather than rows of text.
 *
 * The categories come from the products actually published, not from the category tables: a
 * category nobody has a public product in is a filter that returns nothing, and a filter that
 * returns nothing is a broken filter.
 *
 * There is no basket yet. A product links to the company that sells it, which is where ordering
 * will live when it exists — rather than a button here that would have nowhere to put the order.
 */
export default function ShopPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search, 300);

  const { data: summary } = useDirectorySummaryQuery();
  const { data, isLoading, isError, error, refetch } = useDirectoryProductsQuery(
    debounced,
    category,
    page,
  );

  const products = data?.items ?? [];
  const categories = summary?.categories ?? [];

  function choose(next: string) {
    setCategory(next);
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="Magasiner"
        description="Les produits offerts par les entreprises de Vexta."
      />

      <div className="mb-4 space-y-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Produit, catégorie, entreprise…"
            aria-label="Rechercher un produit"
            className="pl-9"
          />
        </div>

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Catégorie">
            <Button
              type="button"
              size="sm"
              variant={category === "" ? "default" : "outline"}
              onClick={() => choose("")}
            >
              Toutes
            </Button>
            {categories.map((item) => (
              <Button
                key={item}
                type="button"
                size="sm"
                variant={category === item ? "default" : "outline"}
                onClick={() => choose(item)}
              >
                {item}
              </Button>
            ))}
          </div>
        )}
      </div>

      {isLoading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-56 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState error={error} onRetry={() => void refetch()} />
      ) : products.length === 0 ? (
        <EmptyState
          icon={Package}
          title={debounced || category ? "Aucun produit ne correspond" : "Aucun produit en vitrine"}
          description={
            debounced || category
              ? "Essayez un autre mot, ou retirez le filtre."
              : "Les produits qu'une entreprise rend publics apparaîtront ici."
          }
        />
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <li key={product.id}>
                <Link
                  href={`/e/${product.companySlug}`}
                  className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-muted/40"
                >
                  {/* A fixed frame whether or not there is a photograph, so a grid of mixed
                      products does not stagger. */}
                  <div className="flex aspect-[4/3] items-center justify-center bg-muted/40">
                    {product.imageUrl ? (
                      <Image
                        src={product.imageUrl}
                        alt=""
                        width={320}
                        height={240}
                        className="size-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <Package className="size-8 text-muted-foreground" aria-hidden />
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-3">
                    <p className="font-medium text-foreground">{product.title}</p>
                    <p className="text-sm text-muted-foreground">{product.companyName}</p>

                    {product.categoryName && (
                      <p className="mt-1 text-xs text-muted-foreground">{product.categoryName}</p>
                    )}

                    <p className="mt-auto pt-2 font-medium tabular-nums text-foreground">
                      {/* A product with no price shows none. An invented "0,00 $" would be a
                          price, and a wrong one. */}
                      {product.sellingPrice == null ? "Prix sur demande" : formatAmount(product.sellingPrice)}
                    </p>
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
