"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GitBranch, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClickableRow } from "@/components/layout/clickable-row";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { ProductFormSheet } from "@/components/products/product-form-sheet";
import { formatProductNumber, money } from "@/components/products/product-format";
import { AvailableQuantity } from "@/components/products/products-section";
import { useDeleteProduct, useProductVariantsQuery } from "@/hooks/use-products";
import { ApiError } from "@/lib/api";
import type { ProductRecord } from "@/lib/types";

/**
 * The declinations of one product: the same thing in another length, another colour, another
 * finish. Each is a product in its own right, so a row opens its own page rather than a panel.
 */
export function ProductVariantsSection({ product }: { product: ProductRecord }) {
  const router = useRouter();
  const { data, isLoading } = useProductVariantsQuery(product.id);
  const remove = useDeleteProduct();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRecord | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ProductRecord | undefined>(undefined);

  const variants = data ?? [];

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Variante supprimée.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer cette variante.");
    }
  }

  const createButton = (
    <Button onClick={openCreate}>
      <Plus />
      Nouvelle variante
    </Button>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Variantes</h2>
          <p className="text-sm text-muted-foreground">
            Le même produit dans une autre déclinaison, avec sa propre quantité et son propre prix.
          </p>
        </div>
        {createButton}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : variants.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="Aucune variante"
          description="Les longueurs, les couleurs ou les finis du même produit."
          action={createButton}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Numéro</TableHead>
                <TableHead className="hidden w-32 md:table-cell">Code</TableHead>
                <TableHead>Titre</TableHead>
                <TableHead className="w-28 text-right">Qté dispo</TableHead>
                <TableHead className="w-32 text-right">Prix de vente</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {variants.map((variant) => (
                <ClickableRow
                  key={variant.id}
                  label={`Ouvrir la variante ${formatProductNumber(variant.number)}`}
                  onOpen={() => router.push(`/inventaire/produits/${variant.id}`)}
                >
                  <TableCell className="font-mono text-xs tabular-nums">
                    <Link
                      href={`/inventaire/produits/${variant.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {formatProductNumber(variant.number)}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                    {variant.code || "—"}
                  </TableCell>
                  <TableCell className="font-medium">{variant.title}</TableCell>
                  <TableCell className="text-right">
                    <AvailableQuantity product={variant} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {money(variant.sellingPrice)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(variant);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(variant)}>
                          <Trash2 />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </ClickableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ProductFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editing}
        parentProductId={product.id}
        parentTitle={product.title}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer cette variante ?"
        description={`« ${deleteTarget?.title} » sera retirée du catalogue. Les lignes de facture déjà émises la gardent telle qu'elle a été vendue.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
