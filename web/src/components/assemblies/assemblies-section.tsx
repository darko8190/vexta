"use client";

import { useState } from "react";
import { Blocks, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ProductPicker } from "@/components/invoices/product-picker";
import { ClickableRow } from "@/components/layout/clickable-row";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { SearchInput } from "@/components/layout/search-input";
import { SortableHead } from "@/components/layout/sortable-head";
import { useCanManage } from "@/hooks/use-can-create";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  formatAssemblyNumber,
  useAssembliesQuery,
  useDeleteAssembly,
  useSaveAssembly,
  type Assembly,
  type AssemblyItem,
} from "@/hooks/use-assemblies";
import { ApiError } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import { byKeys, sortRows, type SortState } from "@/lib/table-sort";

/**
 * The company's assemblies: sets prepared in advance and installed as one. Each is a list of
 * materials; its cost and price are their sums, and that is what a job is charged when the
 * assembly is put on it.
 */
export function AssembliesSection({ openId }: { openId?: string | null }) {
  const canManage = useCanManage();
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search);
  const { data, isLoading } = useAssembliesQuery(debounced);
  const remove = useDeleteAssembly();
  const [sort, setSort] = useState<SortState | null>({ key: "numero", dir: "desc" });
  const [editing, setEditing] = useState<Assembly | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Assembly | undefined>(undefined);

  // ?id= from a project's assembly line: that assembly opens until it is closed once.
  const [linkClosed, setLinkClosed] = useState(false);
  const linked = !linkClosed && openId ? data?.find((assembly) => assembly.id === openId) : undefined;

  function openForm(assembly?: Assembly) {
    setEditing(assembly);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Assemblage supprimé.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer cet assemblage.");
    }
  }

  const createButton = canManage ? (
    <Button onClick={() => openForm()}>
      <Plus />
      Nouvel assemblage
    </Button>
  ) : undefined;

  const rows = sortRows(
    data ?? [],
    sort,
    byKeys((assembly: Assembly) => ({
      numero: assembly.number,
      nom: assembly.name,
      elements: assembly.itemCount,
      cout: assembly.unitCost,
      prix: assembly.unitPrice,
      projets: assembly.projectCount,
    })),
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Assemblages</h2>
          <p className="text-sm text-muted-foreground">Les ensembles préparés d&apos;avance et installés tels quels.</p>
        </div>
        {createButton}
      </div>

      <div className="mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un assemblage…" />
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Blocks}
          title={debounced ? "Aucun assemblage ne correspond" : "Aucun assemblage"}
          description="Un panneau électrique, un ensemble de robinetterie, une salle de bain type : les produits qui s'installent ensemble, avec leur prix."
          action={debounced ? undefined : createButton}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Numéro" sortKey="numero" sort={sort} onSort={setSort} className="w-28" />
                <SortableHead label="Assemblage" sortKey="nom" sort={sort} onSort={setSort} />
                <SortableHead label="Éléments" sortKey="elements" sort={sort} onSort={setSort} className="w-24 text-right" />
                <SortableHead label="Coûtant" sortKey="cout" sort={sort} onSort={setSort} className="w-32 text-right" />
                <SortableHead label="Vendant" sortKey="prix" sort={sort} onSort={setSort} className="w-32 text-right" />
                <SortableHead label="Projets" sortKey="projets" sort={sort} onSort={setSort} className="w-24 text-right" />
                {canManage && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((assembly) => (
                <ClickableRow key={assembly.id} label={`Ouvrir ${assembly.name}`} onOpen={() => openForm(assembly)}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{formatAssemblyNumber(assembly.number)}</TableCell>
                  <TableCell className="font-medium">
                    {assembly.name}
                    {assembly.description && (
                      <div className="line-clamp-1 text-xs font-normal text-muted-foreground">{assembly.description}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{assembly.itemCount}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{formatAmount(assembly.unitCost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(assembly.unitPrice)}</TableCell>
                  <TableCell className="text-right tabular-nums">{assembly.projectCount}</TableCell>
                  {canManage && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openForm(assembly)}>
                            <Pencil />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(assembly)}>
                            <Trash2 />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </ClickableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {(formOpen || linked) && (
        <AssemblyFormSheet
          key={(formOpen ? editing?.id : linked?.id) ?? "new"}
          open
          onOpenChange={(next) => {
            if (next) return;
            setFormOpen(false);
            setLinkClosed(true);
          }}
          assembly={formOpen ? editing : linked}
          readOnly={!canManage}
        />
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer cet assemblage ?"
        description={`« ${deleteTarget?.name ?? ""} » sera supprimé. Les projets qui l'utilisent gardent leurs lignes.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}

function blankItem(): AssemblyItem {
  return { productId: null, description: "", unit: null, quantity: 1, purchasePrice: null, unitPrice: 0 };
}

function numberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function AssemblyFormSheet({
  open,
  onOpenChange,
  assembly,
  readOnly,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assembly?: Assembly;
  readOnly?: boolean;
}) {
  const save = useSaveAssembly();
  const [name, setName] = useState(assembly?.name ?? "");
  const [description, setDescription] = useState(assembly?.description ?? "");
  const [items, setItems] = useState<AssemblyItem[]>(assembly?.items.length ? assembly.items : [blankItem()]);

  const cost = items.reduce((sum, item) => sum + item.quantity * (item.purchasePrice ?? 0), 0);
  const price = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const valid = name.trim() !== "" && items.length > 0 && items.every((item) => item.description.trim() !== "" && item.quantity > 0);

  function update(index: number, patch: Partial<AssemblyItem>) {
    setItems((previous) => previous.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || readOnly) return;
    try {
      await save.mutateAsync({
        id: assembly?.id,
        values: { name: name.trim(), description: description.trim() || null, items },
      });
      toast.success(assembly ? "Assemblage mis à jour." : "Assemblage créé.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer l'assemblage.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {assembly ? `${formatAssemblyNumber(assembly.number)} · ${assembly.name}` : "Nouvel assemblage"}
          </SheetTitle>
          <SheetDescription>Les produits qui le composent, avec leur quantité et leur prix.</SheetDescription>
        </SheetHeader>

        <form id="assembly-form" className="flex-1 overflow-y-auto px-4" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="assembly-name">
                Nom
                <RequiredMark />
              </FieldLabel>
              <Input id="assembly-name" value={name} maxLength={200} disabled={readOnly} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="assembly-description">Description</FieldLabel>
              <Textarea
                id="assembly-description"
                rows={2}
                value={description}
                disabled={readOnly}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Éléments</p>
              {items.map((item, index) => (
                <div key={index} className="space-y-2 rounded-lg border border-border p-3">
                  {!readOnly && (
                    <ProductPicker
                      placeholder="Prendre un produit du catalogue…"
                      onPick={(product) =>
                        update(index, {
                          productId: product.id,
                          description: product.title,
                          unit: product.unit,
                          purchasePrice: product.purchasePrice,
                          unitPrice: product.sellingPrice ?? 0,
                        })
                      }
                    />
                  )}
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_80px]">
                    <Input
                      aria-label="Description"
                      placeholder="Description"
                      value={item.description}
                      disabled={readOnly}
                      onChange={(event) => update(index, { description: event.target.value, productId: item.productId })}
                    />
                    <Input
                      aria-label="Unité"
                      placeholder="Unité"
                      value={item.unit ?? ""}
                      disabled={readOnly}
                      onChange={(event) => update(index, { unit: event.target.value || null })}
                    />
                  </div>
                  <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                    <label className="space-y-1 text-xs text-muted-foreground">
                      Qté
                      <Input
                        inputMode="decimal"
                        className="text-right"
                        value={item.quantity}
                        disabled={readOnly}
                        onChange={(event) => update(index, { quantity: numberOrNull(event.target.value) ?? 0 })}
                      />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      Coûtant
                      <Input
                        inputMode="decimal"
                        className="text-right"
                        value={item.purchasePrice ?? ""}
                        disabled={readOnly}
                        onChange={(event) => update(index, { purchasePrice: numberOrNull(event.target.value) })}
                      />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      Vendant
                      <Input
                        inputMode="decimal"
                        className="text-right"
                        value={item.unitPrice}
                        disabled={readOnly}
                        onChange={(event) => update(index, { unitPrice: numberOrNull(event.target.value) ?? 0 })}
                      />
                    </label>
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Retirer l'élément"
                        disabled={items.length === 1}
                        onClick={() => setItems((previous) => previous.filter((_, i) => i !== index))}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {!readOnly && (
                <Button type="button" variant="outline" size="sm" onClick={() => setItems((previous) => [...previous, blankItem()])}>
                  <Plus />
                  Ajouter un élément
                </Button>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Coûtant de l&apos;assemblage</dt>
                <dd className="font-medium tabular-nums">{formatAmount(cost)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Vendant de l&apos;assemblage</dt>
                <dd className="font-medium tabular-nums">{formatAmount(price)}</dd>
              </div>
            </dl>
          </FieldGroup>
        </form>

        <SheetFooter>
          {!readOnly && (
            <Button type="submit" form="assembly-form" disabled={save.isPending || !valid}>
              {save.isPending && <Spinner />}
              {assembly ? "Enregistrer" : "Créer l'assemblage"}
            </Button>
          )}
          <SheetClose render={<Button type="button" variant="outline" />}>{readOnly ? "Fermer" : "Annuler"}</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
