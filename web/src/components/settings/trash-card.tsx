"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { SearchInput } from "@/components/layout/search-input";
import { ApiError, api } from "@/lib/api";
import { formatMoment } from "@/lib/dates";
import { matchesSearch } from "@/lib/text-match";
import { BulkActionBar, SelectAllHead, SelectRowCell, useRowSelection, type BulkAction } from "@/components/layout/bulk-actions";

interface TrashItem {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  deletedAt: string;
  deletedBy: string | null;
  details: { label: string; value: string }[];
}

const typeLabels: Record<string, string> = {
  client: "Client",
  projet: "Projet",
  soumission: "Soumission",
  facture: "Facture",
  produit: "Produit",
  equipement: "Équipement",
  fournisseur: "Fournisseur",
};

/**
 * Everything deleted, still recoverable: look at it, put it back, or delete it for good. Emptying
 * the corbeille deletes everything in it; what is still used elsewhere stays and is named.
 */
export function TrashCard() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["corbeille"], queryFn: () => api.get<TrashItem[]>("corbeille") });
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<TrashItem | null>(null);
  const [purging, setPurging] = useState<TrashItem | null>(null);
  const [emptying, setEmptying] = useState(false);

  const refresh = () => queryClient.invalidateQueries();

  const restore = useMutation({
    mutationFn: (item: TrashItem) => api.post(`corbeille/${item.type}/${item.id}/restaurer`),
    onSuccess: (_, item) => {
      toast.success(`« ${item.title} » est restauré.`);
      setViewing(null);
      void refresh();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Impossible de restaurer cet élément."),
  });

  const purge = useMutation({
    mutationFn: (item: TrashItem) => api.delete(`corbeille/${item.type}/${item.id}`),
    onSuccess: () => {
      toast.success("Supprimé définitivement.");
      setPurging(null);
      void queryClient.invalidateQueries({ queryKey: ["corbeille"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer cet élément."),
  });

  const empty = useMutation({
    mutationFn: () => api.delete<{ deleted: number; kept: number; problems: string[] }>("corbeille"),
    onSuccess: (result) => {
      setEmptying(false);
      void queryClient.invalidateQueries({ queryKey: ["corbeille"] });
      if (result.kept > 0) toast.warning(`${result.deleted} supprimé(s). ${result.problems[0] ?? ""}`);
      else toast.success("La corbeille est vide.");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Impossible de vider la corbeille."),
  });

  const items = (data ?? []).filter((item) =>
    matchesSearch(search, item.title, item.subtitle, typeLabels[item.type], item.deletedBy),
  );
  const selection = useRowSelection(items, (item) => `${item.type}-${item.id}`);
  const selectable = true;
  const bulkActions: BulkAction<TrashItem>[] = [
    {
      key: "restaurer",
      label: "Restaurer",
      icon: RotateCcw,
      run: (item) => api.post(`corbeille/${item.type}/${item.id}/restaurer`),
      done: (count) => (count > 1 ? `${count} éléments restaurés.` : "Élément restauré."),
      finish: refresh,
    },
    {
      key: "supprimer",
      label: "Supprimer définitivement",
      icon: Trash2,
      destructive: true,
      confirm: {
        title: "Supprimer définitivement ?",
        description: (count) => `${count} élément(s) seront effacés pour de bon. Cette action ne peut pas être annulée.`,
      },
      run: (item) => api.delete(`corbeille/${item.type}/${item.id}`),
      done: (count) => (count > 1 ? `${count} éléments supprimés définitivement.` : "Supprimé définitivement."),
      finish: () => queryClient.invalidateQueries({ queryKey: ["corbeille"] }),
    },
  ];

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Corbeille</h2>
          <p className="text-sm text-muted-foreground">
            Les clients, projets, soumissions, factures, produits, équipements et fournisseurs supprimés.
          </p>
        </div>
        <Button variant="destructive" onClick={() => setEmptying(true)} disabled={!data || data.length === 0}>
          <Trash2 />
          Vider la corbeille
        </Button>
      </div>

      {(data?.length ?? 0) > 0 && (
        <div className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher dans la corbeille…" />
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title={search ? "Rien ne correspond" : "La corbeille est vide"}
          description="Ce que vous supprimez arrive ici, et peut être restauré tant que la corbeille n'est pas vidée."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {selectable && (
            <BulkActionBar selection={selection} actions={bulkActions} className="mb-0 rounded-none border-0 border-b" />
          )}
          <Table>
            <TableHeader>
              <TableRow>
                {selectable && <SelectAllHead selection={selection} />}
                <TableHead>Élément</TableHead>
                <TableHead className="w-32">Type</TableHead>
                <TableHead className="hidden w-48 md:table-cell">Supprimé</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={`${item.type}-${item.id}`}>
                  {selectable && <SelectRowCell selection={selection} row={item} label={item.title} />}
                  <TableCell className="font-medium">
                    {item.title}
                    {item.subtitle && <div className="truncate text-xs font-normal text-muted-foreground">{item.subtitle}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{typeLabels[item.type] ?? item.type}</Badge>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {formatMoment(item.deletedAt)}
                    {item.deletedBy && <div className="text-xs">par {item.deletedBy}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" aria-label="Revoir" title="Revoir" onClick={() => setViewing(item)}>
                        <Eye />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Restaurer"
                        title="Restaurer"
                        onClick={() => restore.mutate(item)}
                        disabled={restore.isPending}
                      >
                        <RotateCcw />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        aria-label="Supprimer définitivement"
                        title="Supprimer définitivement"
                        onClick={() => setPurging(item)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={Boolean(viewing)} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewing?.title}</DialogTitle>
            <DialogDescription>
              {viewing && `${typeLabels[viewing.type] ?? viewing.type} supprimé le ${formatMoment(viewing.deletedAt)}`}
              {viewing?.deletedBy && ` par ${viewing.deletedBy}`}
            </DialogDescription>
          </DialogHeader>
          <dl className="grid gap-2 text-sm">
            {viewing?.details.map((field) => (
              <div key={field.label} className="flex justify-between gap-4 border-b border-border pb-1.5 last:border-0">
                <dt className="text-muted-foreground">{field.label}</dt>
                <dd className="text-right text-foreground">{field.value}</dd>
              </div>
            ))}
          </dl>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>
              Fermer
            </Button>
            <Button onClick={() => viewing && restore.mutate(viewing)} disabled={restore.isPending}>
              <RotateCcw />
              Restaurer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(purging)}
        onOpenChange={(open) => !open && setPurging(null)}
        title="Supprimer définitivement ?"
        description={`« ${purging?.title ?? ""} » sera effacé pour de bon. Cette action ne peut pas être annulée.`}
        onConfirm={() => purging && purge.mutate(purging)}
        pending={purge.isPending}
      />

      <ConfirmDeleteDialog
        open={emptying}
        onOpenChange={setEmptying}
        title="Vider la corbeille ?"
        description={`Les ${data?.length ?? 0} élément(s) de la corbeille seront effacés pour de bon. Cette action ne peut pas être annulée.`}
        onConfirm={() => empty.mutate()}
        pending={empty.isPending}
      />
    </div>
  );
}
