"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductFormSheet } from "@/components/products/product-form-sheet";
import {
  duration,
  money,
  percent,
  quantity,
  timestamp,
} from "@/components/products/product-format";
import { StockMovementDialog } from "@/components/products/stock-movement-dialog";
import type { ProductRecord } from "@/lib/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}

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
  const [editOpen, setEditOpen] = useState(false);
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
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil />
            Modifier
          </Button>
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

      <dl className="grid gap-4 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-2">
        <Row label="Code">
          <span className="font-mono text-xs">{product.code || "—"}</span>
        </Row>
        <Row label="Code à barres">
          <span className="font-mono text-xs">{product.barcode || "—"}</span>
        </Row>

        <Row label="Catégorie">
          {product.categoryName ? (
            <span className="flex flex-wrap gap-1">
              <Badge variant="secondary">{product.categoryName}</Badge>
              {product.subCategoryName && <Badge variant="outline">{product.subCategoryName}</Badge>}
            </span>
          ) : (
            "—"
          )}
        </Row>
        <Row label="Page publique">{product.isPublic ? "Visible" : "Non publié"}</Row>

        {/* Both prices carry the unit — a price is per something, and "4,50 $" on its own is the
            kind of figure that gets quoted for a whole roof. The margin is a percentage of the
            two, so it has none. */}
        <Row label="Prix d'achat">
          <span className="tabular-nums">{money(product.purchasePrice, product.unit)}</span>
        </Row>
        <Row label="Marge">
          <span className="tabular-nums">{percent(product.marginPercent)}</span>
        </Row>
        <Row label="Prix de vente">
          <span className="tabular-nums">{money(product.sellingPrice, product.unit)}</span>
        </Row>
        <Row label="Temps d'installation">{duration(product.installationMinutes)}</Row>

        {/* Spelled out as a row of its own as well, so the unit can be read off the page even for
            a product with no price and no quantity to hang it on. */}
        <Row label="Unité">{product.unit || "—"}</Row>
        <Row label="Minimum">
          <span className="tabular-nums">
            {product.tracksInventory ? quantity(product.minimumQuantity, product.unit) : "—"}
          </span>
        </Row>
        <Row label="Maximum">
          <span className="tabular-nums">
            {product.tracksInventory ? quantity(product.maximumQuantity, product.unit) : "—"}
          </span>
        </Row>

        {product.parentProductId && (
          <Row label="Variante de">
            <Link
              href={`/inventaire/produits/${product.parentProductId}`}
              className="underline-offset-4 hover:underline"
            >
              {product.parentTitle ?? "Produit parent"}
            </Link>
          </Row>
        )}

        <Row label="Créé le">{timestamp(product.createdAt)}</Row>
        <Row label="Modifié le">{timestamp(product.updatedAt)}</Row>

        {product.description && (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Description</dt>
            <dd className="max-w-prose whitespace-pre-line text-foreground">{product.description}</dd>
          </div>
        )}

        {product.note && (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Note</dt>
            <dd className="max-w-prose whitespace-pre-line text-foreground">{product.note}</dd>
          </div>
        )}
      </dl>

      <ProductFormSheet open={editOpen} onOpenChange={setEditOpen} product={product} />

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
