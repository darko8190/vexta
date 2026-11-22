"use client";

import { TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { money, percent, timestamp } from "@/components/products/product-format";
import { useProductPricesQuery } from "@/hooks/use-products";

/** What the product cost and sold for, each time one of the three figures moved. */
export function ProductPricesSection({ productId }: { productId: string }) {
  const { data, isLoading } = useProductPricesQuery(productId);
  const entries = data ?? [];

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Historique de prix</h2>
        <p className="text-sm text-muted-foreground">
          Pour que « c&apos;était moins cher avant » soit une question qui a une réponse.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Aucun changement de prix"
          description="Chaque fois qu'un prix d'achat, une marge ou un prix de vente change, la ligne s'ajoute ici."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Date</TableHead>
                <TableHead className="w-32 text-right">Prix d&apos;achat</TableHead>
                <TableHead className="w-24 text-right">Marge</TableHead>
                <TableHead className="w-32 text-right">Prix de vente</TableHead>
                <TableHead className="hidden md:table-cell">Par</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {timestamp(entry.createdAt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {money(entry.purchasePrice)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {percent(entry.marginPercent)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-foreground">
                    {money(entry.sellingPrice)}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {entry.changedByName || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
