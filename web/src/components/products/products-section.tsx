"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, MoreHorizontal, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { SearchInput } from "@/components/layout/search-input";
import { WorkbookMenu } from "@/components/import-export/workbook-menu";
import { ProductFormSheet } from "@/components/products/product-form-sheet";
import { formatProductNumber, money, quantity } from "@/components/products/product-format";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useDeleteProduct, useProductsQuery } from "@/hooks/use-products";
import { api, ApiError } from "@/lib/api";
import type { ProductRecord } from "@/lib/types";
import { SortableHead } from "@/components/layout/sortable-head";
import { byKeys, sortRows, type SortState } from "@/lib/table-sort";

/**
 * What the shelf can still promise, with the two figures it comes from underneath.
 *
 * A product that is not counted shows nothing numeric at all: a zero in this column would be
 * read as "none left" when it means "we do not count this".
 */
export function AvailableQuantity({ product }: { product: ProductRecord }) {
  if (!product.tracksInventory) {
    return <span className="text-sm text-muted-foreground">Non suivi</span>;
  }

  return (
    <span
      className="inline-block"
      title={`${quantity(product.quantityOnHand, product.unit)} en main, ${quantity(product.quantityReserved, product.unit)} réservé`}
    >
      {/* The unit rides on the figure that is read first, and only on that one: repeating "pi"
          on the two figures underneath would triple it in a column 28 units wide. */}
      <span className="font-medium tabular-nums">{quantity(product.quantityAvailable, product.unit)}</span>
      <span className="block text-xs text-muted-foreground tabular-nums">
        {quantity(product.quantityOnHand)} en main · {quantity(product.quantityReserved)} réservé
      </span>
    </span>
  );
}

/** The catalogue, as Inventaire lists it. Pressing a row opens the product's own page. */
export function ProductsSection() {
  const router = useRouter();
  const queryClient = useQueryClient();
  // A copy to start the next product from, opened at once to be renamed.
  const duplicate = useMutation({
    mutationFn: (id: string) => api.post<{ id: string }>(`products/${id}/dupliquer`),
    onSuccess: (copy) => {
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produit dupliqué.", { description: "Changez son nom et son code, puis enregistrez." });
      router.push(`/inventaire/produits/${copy.id}`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Impossible de dupliquer le produit."),
  });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState | null>({ key: "numero", dir: "desc" });
  const debouncedSearch = useDebouncedValue(search);

  const {
    data,
    isLoading,
    isError,
    isPlaceholderData,
    error: loadError,
    refetch,
  } = useProductsQuery({ page, search: debouncedSearch });
  const remove = useDeleteProduct();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRecord | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ProductRecord | undefined>(undefined);

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(product: ProductRecord) {
    setEditing(product);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Produit supprimé.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer ce produit.");
    }
  }

  const createButton = (
    <Button onClick={openCreate}>
      <Plus />
      Nouveau produit
    </Button>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Produits</h2>
          <p className="text-sm text-muted-foreground">Ce que vous gardez en stock et revendez.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WorkbookMenu entity="produits" label="produits" />
          {createButton}
        </div>
      </div>

      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Titre, code, code à barres…"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        /* Three states, not two: a failed read is not an empty catalogue, and neither of those
           is a search that matched nothing. Telling someone their products are gone because a
           request failed is the one message that cannot be taken back, so the failure is
           answered first and the two "nothing here" wordings below keep their own cases.
           And `isError` alone is too wide: a failed background refetch keeps it true over rows
           that are still right, so the panel only wins with nothing read at all (`!data`) or rows
           left over from another query key (`isPlaceholderData`). */
        <LoadErrorState
          error={loadError}
          title="Produits indisponibles"
          fallback="Vos produits n'ont pas pu être chargés."
          onRetry={() => refetch()}
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={Package}
          title={debouncedSearch ? "Aucun produit trouvé" : "Aucun produit"}
          description={
            debouncedSearch
              ? "Essayez une autre recherche."
              : "Les pièces, les boîtes et les accessoires que vous revendez ou installez."
          }
          action={debouncedSearch ? undefined : createButton}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Numéro" sortKey="numero" sort={sort} onSort={setSort} className="w-24" />
                <SortableHead label="Code" sortKey="code" sort={sort} onSort={setSort} className="hidden w-32 md:table-cell" />
                <SortableHead label="Titre" sortKey="titre" sort={sort} onSort={setSort} />
                <SortableHead label="Catégorie" sortKey="categorie" sort={sort} onSort={setSort} className="hidden lg:table-cell" />
                <SortableHead label="Qté dispo" sortKey="dispo" sort={sort} onSort={setSort} className="w-28 text-right" />
                <SortableHead label="Prix de vente" sortKey="prix" sort={sort} onSort={setSort} className="w-32 text-right" />
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortRows(data.items, sort, byKeys((product) => ({ numero: product.number, code: product.code, titre: product.title, categorie: product.categoryName, dispo: product.quantityAvailable, prix: product.sellingPrice }))).map((product) => (
                <ClickableRow
                  key={product.id}
                  label={`Ouvrir le produit ${formatProductNumber(product.number)}`}
                  onOpen={() => router.push(`/inventaire/produits/${product.id}`)}
                >
                  <TableCell className="font-mono text-xs tabular-nums">
                    <Link
                      href={`/inventaire/produits/${product.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {formatProductNumber(product.number)}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                    {product.code || "—"}
                  </TableCell>
                  <TableCell className="font-medium">
                    {product.title}
                    {product.variantCount > 0 && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {product.variantCount === 1 ? "1 variante" : `${product.variantCount} variantes`}
                      </span>
                    )}
                    {product.description && (
                      <div className="line-clamp-1 text-xs font-normal text-muted-foreground">
                        {product.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {product.categoryName ? (
                      <span className="flex flex-wrap gap-1">
                        <Badge variant="secondary">{product.categoryName}</Badge>
                        {product.subCategoryName && <Badge variant="outline">{product.subCategoryName}</Badge>}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <AvailableQuantity product={product} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {money(product.sellingPrice)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem render={<Link href={`/inventaire/produits/${product.id}`} />}>
                          <ExternalLink />
                          Ouvrir la fiche
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(product)}>
                          <Pencil />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicate.mutate(product.id)}>
                          <Copy />
                          Dupliquer
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(product)}>
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

      <PaginationBar result={data} onPageChange={setPage} />

      <ProductFormSheet open={formOpen} onOpenChange={setFormOpen} product={editing} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer ce produit ?"
        description={`« ${deleteTarget?.title} » sera retiré du catalogue. Les lignes de facture déjà émises le gardent tel qu'il a été vendu.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
