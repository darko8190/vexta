"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardList, PackageCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { SelectAllHead, SelectRowCell, useRowSelection } from "@/components/layout/bulk-actions";
import { formatProductNumber, quantity } from "@/components/products/product-format";
import { useProductsToReorderQuery } from "@/hooks/use-products";
import { useSavePurchaseOrder, useSuppliersQuery } from "@/hooks/use-suppliers";
import { ApiError } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import type { ProductRecord } from "@/lib/types";

/** Back up to the maximum when there is one, otherwise to the minimum. Never below zero. */
function suggestedQuantity(product: ProductRecord) {
  const target = product.maximumQuantity ?? product.minimumQuantity ?? 0;
  const need = target - (product.quantityAvailable + product.quantityOnOrder);
  return Math.max(0, Math.round(need * 100) / 100);
}

/**
 * The products under their minimum once what is already on order is counted, so nothing is
 * ordered twice. Tick some, pick the supplier, and they become one purchase order.
 *
 * Shown in Inventaire and in Fournisseurs & Commandes: the shelf is read in one, and the order
 * is placed from the other.
 */
export function ReorderSection() {
  const { data, isLoading, isError, error, refetch } = useProductsToReorderQuery();
  const rows = data ?? [];
  const selection = useRowSelection(rows, (product) => product.id);
  const [ordering, setOrdering] = useState(false);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Produits à commander</h2>
        <p className="text-sm text-muted-foreground">
          Les produits suivis en inventaire dont la quantité disponible, plus ce qui est déjà en
          commande, est sous le minimum. Cochez-les pour en faire un bon de commande.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Liste indisponible"
          fallback="Les produits à commander n'ont pas pu être chargés."
          onRetry={() => refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="Rien à commander"
          description="Tous les produits suivis sont au-dessus de leur minimum, en comptant ce qui est déjà en commande."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          {selection.selectedRows.length > 0 && (
            <div
              role="toolbar"
              aria-label="Actions sur la sélection"
              className="flex flex-wrap items-center gap-2 border-b border-border bg-primary/5 px-3 py-2"
            >
              <span className="text-sm font-medium text-foreground">
                {selection.selectedRows.length} sélectionné{selection.selectedRows.length > 1 ? "s" : ""}
              </span>
              <div className="flex-1">
                <Button size="sm" onClick={() => setOrdering(true)}>
                  <ClipboardList />
                  Créer un bon de commande
                </Button>
              </div>
              <Button size="sm" variant="ghost" onClick={selection.clear}>
                <X />
                Désélectionner
              </Button>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <SelectAllHead selection={selection} />
                <TableHead>Produit</TableHead>
                <TableHead className="text-right">Disponible</TableHead>
                <TableHead className="text-right">En commande</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Minimum</TableHead>
                <TableHead className="hidden text-right md:table-cell">Maximum</TableHead>
                <TableHead className="text-right">À commander</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((product) => (
                <TableRow key={product.id} data-state={selection.isSelected(product) ? "selected" : undefined}>
                  <SelectRowCell selection={selection} row={product} label={product.title} />
                  <TableCell>
                    <Link
                      href={`/inventaire/produits/${product.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {product.parentTitle ? `${product.parentTitle} — ${product.title}` : product.title}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground tabular-nums">
                      {formatProductNumber(product.number)}
                      {product.code && ` · ${product.code}`}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{quantity(product.quantityAvailable, product.unit)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{quantity(product.quantityOnOrder)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                    {quantity(product.minimumQuantity)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                    {product.maximumQuantity === null ? "—" : quantity(product.maximumQuantity)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {quantity(suggestedQuantity(product), product.unit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {ordering && (
        <CreateOrderDialog
          products={selection.selectedRows}
          onClose={() => setOrdering(false)}
          onCreated={() => {
            setOrdering(false);
            selection.clear();
          }}
        />
      )}
    </div>
  );
}

/** The supplier, and each line's quantity and cost, before the order is written. */
function CreateOrderDialog({
  products,
  onClose,
  onCreated,
}: {
  products: ProductRecord[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { data: suppliers } = useSuppliersQuery("");
  const save = useSavePurchaseOrder();
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState(() =>
    products.map((product) => ({
      product,
      quantity: String(suggestedQuantity(product) || 1),
      unitCost: product.purchasePrice === null ? "" : String(product.purchasePrice),
    })),
  );

  const invalid = lines.some((line) => !(Number(line.quantity) > 0) || Number(line.unitCost || 0) < 0);

  function submit() {
    if (!supplierId) {
      toast.error("Choisissez le fournisseur.");
      return;
    }
    save.mutate(
      {
        id: null,
        values: {
          supplierId,
          projectId: null,
          orderedOn: todayIso(),
          expectedOn: null,
          reference: null,
          note: null,
          lines: lines.map((line) => ({
            id: null,
            productId: line.product.id,
            description: line.product.parentTitle ? `${line.product.parentTitle} — ${line.product.title}` : line.product.title,
            unit: line.product.unit,
            quantity: Number(line.quantity),
            unitCost: Number(line.unitCost || 0),
          })),
        },
      },
      {
        onSuccess: (detail) => {
          toast.success(
            `Bon de commande ${detail.order.number} créé en brouillon. Envoyez-le au fournisseur : les quantités compteront alors en commande.`,
          );
          onCreated();
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Impossible de créer le bon de commande."),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Créer un bon de commande</DialogTitle>
          <DialogDescription>
            {products.length} produit{products.length > 1 ? "s" : ""}. Les quantités proposées remontent au
            maximum, ou au minimum s&apos;il n&apos;y a pas de maximum.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="reorder-supplier">Fournisseur</FieldLabel>
          <Select value={supplierId} onValueChange={(value) => setSupplierId(value ?? "")}>
            <SelectTrigger id="reorder-supplier" className="w-full">
              <SelectValue placeholder="Choisir le fournisseur">
                {(value: string) => suppliers?.find((s) => s.id === value)?.name ?? "Choisir le fournisseur"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(suppliers ?? []).map((supplier) => (
                <SelectItem key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {suppliers && suppliers.length === 0 && (
            <FieldDescription>Aucun fournisseur : ajoutez-en un dans Fournisseurs &amp; Commandes.</FieldDescription>
          )}
        </Field>

        <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produit</TableHead>
                <TableHead className="w-28 text-right">Quantité</TableHead>
                <TableHead className="w-32 text-right">Coût unitaire</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, index) => (
                <TableRow key={line.product.id}>
                  <TableCell className="whitespace-normal text-sm">
                    {line.product.title}
                    {line.product.unit && <span className="text-muted-foreground"> ({line.product.unit})</span>}
                  </TableCell>
                  <TableCell className="py-1">
                    <Input
                      aria-label={`Quantité de ${line.product.title}`}
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      className="h-8 text-right"
                      value={line.quantity}
                      onChange={(event) =>
                        setLines((current) => current.map((l, i) => (i === index ? { ...l, quantity: event.target.value } : l)))
                      }
                    />
                  </TableCell>
                  <TableCell className="py-1">
                    <Input
                      aria-label={`Coût unitaire de ${line.product.title}`}
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      className="h-8 text-right"
                      value={line.unitCost}
                      placeholder="0,00"
                      onChange={(event) =>
                        setLines((current) => current.map((l, i) => (i === index ? { ...l, unitCost: event.target.value } : l)))
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={save.isPending || invalid}>
            {save.isPending && <Spinner />}
            Créer le bon de commande
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
