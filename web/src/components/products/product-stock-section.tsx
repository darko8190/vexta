"use client";

import { useState } from "react";
import { History, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { quantity, timestamp } from "@/components/products/product-format";
import { StockMovementDialog } from "@/components/products/stock-movement-dialog";
import { useProductStockQuery } from "@/hooks/use-products";
import type { ProductRecord } from "@/lib/types";

/** What came in, what left, and what was on the shelf after each movement. */
export function ProductStockSection({ product }: { product: ProductRecord }) {
  const { data, isLoading } = useProductStockQuery(product.id);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const entries = data ?? [];

  const adjustButton = product.tracksInventory ? (
    <Button variant="outline" onClick={() => setAdjustOpen(true)}>
      <SlidersHorizontal />
      Ajuster l&apos;inventaire
    </Button>
  ) : undefined;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Historique d&apos;inventaire</h2>
          <p className="text-sm text-muted-foreground">Chaque réception, sortie et décompte, avec sa raison.</p>
        </div>
        {adjustButton}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={History}
          title="Aucun mouvement"
          description="Les réceptions et les sorties apparaîtront ici, la plus récente en premier."
          action={adjustButton}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Date</TableHead>
                <TableHead className="w-24 text-right">Mouvement</TableHead>
                <TableHead className="w-24 text-right">Après</TableHead>
                <TableHead>Raison</TableHead>
                <TableHead className="hidden md:table-cell">Par</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {timestamp(entry.createdAt)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium tabular-nums ${
                      entry.quantityChange < 0 ? "text-destructive" : "text-foreground"
                    }`}
                  >
                    {entry.quantityChange > 0 ? `+${quantity(entry.quantityChange)}` : quantity(entry.quantityChange)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {quantity(entry.quantityAfter)}
                  </TableCell>
                  <TableCell>{entry.reason || "—"}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {entry.createdByName || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <StockMovementDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        productId={product.id}
        productTitle={product.title}
        quantityOnHand={product.quantityOnHand}
      />
    </div>
  );
}
