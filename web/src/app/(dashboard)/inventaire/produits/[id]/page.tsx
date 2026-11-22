"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  GitBranch,
  History,
  Images,
  Info,
  Package,
  ShoppingCart,
  Truck,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { ProductBarcode } from "@/components/products/product-barcode";
import { ProductDetailsSection } from "@/components/products/product-details-section";
import { formatProductNumber } from "@/components/products/product-format";
import { ProductImagesSection } from "@/components/products/product-images-section";
import { ProductPricesSection } from "@/components/products/product-prices-section";
import { ProductStockSection } from "@/components/products/product-stock-section";
import { ProductVariantsSection } from "@/components/products/product-variants-section";
import { SectionPlaceholder } from "@/components/projects/detail/section-placeholder";
import { useProductQuery, useProductSummaryQuery } from "@/hooks/use-products";
import { cn } from "@/lib/utils";

/**
 * One product. The card at the top is what a counter clerk reads out — the number, the code, the
 * name, where it is filed and the barcode on the box — and everything that is tracked against it
 * hangs off the rail below, badge-counted so the whole record reads at a glance.
 */
export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: product, isLoading, isError } = useProductQuery(id);
  const { data: summary } = useProductSummaryQuery(id);

  const [section, setSection] = useState("details");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !product) {
    return (
      <EmptyState
        icon={Package}
        title="Produit introuvable"
        description="Ce produit n'existe plus, ou vous n'y avez pas accès."
        action={
          <Link href="/inventaire" className={cn(buttonVariants())}>
            Retour à l&apos;inventaire
          </Link>
        }
      />
    );
  }

  const counts = summary?.counts;

  // Détails carries no badge: it is one thing, not a list of them.
  const sections: NavSection[] = [
    { key: "details", label: "Détails", icon: Info },
    { key: "images", label: "Images", count: counts?.images ?? product.imageCount, icon: Images },
    { key: "variantes", label: "Variantes", count: counts?.variants ?? product.variantCount, icon: GitBranch },
    { key: "fournisseurs", label: "Fournisseurs du produit", count: counts?.suppliers ?? 0, icon: Truck },
    { key: "inventaire", label: "Historique d'inventaire", count: counts?.stockEntries ?? 0, icon: History },
    { key: "prix", label: "Historique de prix", count: counts?.priceEntries ?? 0, icon: TrendingUp },
    { key: "achats", label: "Historique d'achat", count: counts?.purchases ?? 0, icon: ShoppingCart },
  ];

  return (
    <div>
      <Link
        href="/inventaire"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Inventaire
      </Link>

      <div className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {formatProductNumber(product.number)}
              </span>
              {product.categoryName && <Badge variant="secondary">{product.categoryName}</Badge>}
              {product.subCategoryName && <Badge variant="outline">{product.subCategoryName}</Badge>}
              {!product.tracksInventory && <Badge variant="outline">Non suivi</Badge>}
              {product.isPublic && <Badge variant="outline">Page publique</Badge>}
            </div>

            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {product.title}
            </h1>

            {product.parentProductId && (
              <p className="mt-1 text-sm text-muted-foreground">
                Variante de{" "}
                <Link
                  href={`/inventaire/produits/${product.parentProductId}`}
                  className="underline-offset-4 hover:underline"
                >
                  {product.parentTitle ?? "son produit parent"}
                </Link>
              </p>
            )}

            {product.code && <p className="mt-2 font-mono text-sm text-muted-foreground">{product.code}</p>}

            {product.barcode && <ProductBarcode value={product.barcode} className="mt-2" />}
          </div>
        </div>
      </div>

      {/* The rail sits beside the content from md up and becomes a scrollable row below it. */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav
          sections={sections}
          active={section}
          onSelect={setSection}
          label="Sections du produit"
        />

        <div className="min-w-0 flex-1">
          {section === "details" && <ProductDetailsSection product={product} />}
          {section === "images" && <ProductImagesSection productId={product.id} />}
          {section === "variantes" && <ProductVariantsSection product={product} />}

          {section === "fournisseurs" && (
            <SectionPlaceholder
              icon={Truck}
              title="Fournisseurs du produit"
              description="Chez qui l'acheter, à quel prix et en combien de temps."
            />
          )}

          {section === "inventaire" && <ProductStockSection product={product} />}
          {section === "prix" && <ProductPricesSection productId={product.id} />}

          {section === "achats" && (
            <SectionPlaceholder
              icon={ShoppingCart}
              title="Historique d'achat"
              description="Les bons de commande et les réceptions pour ce produit."
            />
          )}
        </div>
      </div>
    </div>
  );
}
