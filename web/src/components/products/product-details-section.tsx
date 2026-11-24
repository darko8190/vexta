"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineSheet } from "@/components/ui/sheet";
import { ProductFormSheet } from "@/components/products/product-form-sheet";
import { quantity } from "@/components/products/product-format";
import { StockMovementDialog } from "@/components/products/stock-movement-dialog";
import type { ProductRecord } from "@/lib/types";

/** One of the three quantities, big enough to read across a counter. */
function Quantity({
  label,
  value,
  note,
  muted,
}: {
  label: string;
  value: string;
  note: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${muted ? "text-muted-foreground" : "text-foreground"}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

/** Everything the product carries, and the one action that changes what is on the shelf. */
export function ProductDetailsSection({ product }: { product: ProductRecord }) {
  const [adjustOpen, setAdjustOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Détails</h2>
          <p className="text-sm text-muted-foreground">Les prix, les seuils et ce qui est sur la tablette.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {product.tracksInventory && (
            <Button variant="outline" onClick={() => setAdjustOpen(true)}>
              <SlidersHorizontal />
              Ajuster l&apos;inventaire
            </Button>
          )}
        </div>
      </div>

      {product.tracksInventory ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {/* The unit is on all three: each tile is read on its own, across a counter, and a
              figure that borrows its unit from the tile beside it is a figure read wrong. */}
          <Quantity
            label="Quantité physique"
            value={quantity(product.quantityOnHand, product.unit)}
            note="Ce qui est sur la tablette."
          />
          <Quantity
            label="Réservé"
            value={quantity(product.quantityReserved, product.unit)}
            note="Promis à des factures non réglées."
            muted
          />
          <Quantity
            label="Disponible"
            value={quantity(product.quantityAvailable, product.unit)}
            note="Ce qui peut encore être vendu."
          />
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Ce produit n&apos;est pas suivi en inventaire : il se vend au mètre, au voyage ou à la
          pièce sans décompte, alors aucune quantité n&apos;est tenue pour lui.
        </p>
      )}

      {/* The product's fields, editable where they are read: one Enregistrer instead of a
          summary and a Modifier that opened the same form on top. */}
      <InlineSheet>
        <ProductFormSheet open onOpenChange={() => {}} product={product} />
      </InlineSheet>

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
