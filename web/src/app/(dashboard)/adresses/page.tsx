"use client";

import { useState } from "react";
import { MapPin, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import { AddressFormSheet } from "@/components/addresses/address-form-sheet";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { UpgradeCta } from "@/components/layout/upgrade-cta";
import { useCanCreate } from "@/hooks/use-can-create";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { SearchInput } from "@/components/layout/search-input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAddressesQuery, useDeleteAddress } from "@/hooks/use-addresses";
import { addressTypeLabels } from "@/lib/labels";
import type { AddressRecord } from "@/lib/types";

export default function AddressesPage() {
  const canCreate = useCanCreate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading } = useAddressesQuery(page, debouncedSearch);
  const deleteAddress = useDeleteAddress();

  const [formOpen, setFormOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<AddressRecord | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<AddressRecord | undefined>(undefined);

  function openCreate() {
    setEditingAddress(undefined);
    setFormOpen(true);
  }

  function openEdit(address: AddressRecord) {
    setEditingAddress(address);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteAddress.mutateAsync(deleteTarget.id);
      toast.success("Adresse supprimée.");
      setDeleteTarget(undefined);
    } catch {
      toast.error("Impossible de supprimer cette adresse.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Adresses"
        description="Gérez les adresses de facturation et de livraison de vos clients."
        action={
          canCreate ? (
            <Button onClick={openCreate}>
              <Plus />
              Nouvelle adresse
            </Button>
          ) : (
            <UpgradeCta />
          )
        }
      />

      <div className="mb-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Rechercher une adresse…" />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title={debouncedSearch ? "Aucune adresse trouvée" : "Aucune adresse pour l'instant"}
          description={
            debouncedSearch
              ? "Essayez une autre recherche."
              : canCreate
                ? "Ajoutez une adresse à l'un de vos clients."
                : "La création de fiches est réservée aux comptes entreprise."
          }
          action={
            !debouncedSearch &&
            (canCreate ? (
              <Button onClick={openCreate}>
                <Plus />
                Nouvelle adresse
              </Button>
            ) : (
              <UpgradeCta />
            ))
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Adresse</TableHead>
                <TableHead>Ville</TableHead>
                <TableHead>Code postal</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((addressItem) => (
                <TableRow key={addressItem.id}>
                  <TableCell className="font-medium">{addressItem.clientName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {addressTypeLabels[addressItem.type]}
                      {addressItem.isPrimary && <Badge variant="secondary">Principale</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {addressItem.line1}
                    {addressItem.line2 ? `, ${addressItem.line2}` : ""}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{addressItem.city}</TableCell>
                  <TableCell className="text-muted-foreground">{addressItem.postalCode}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEdit(addressItem)}>
                          <Pencil />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(addressItem)}>
                          <Trash2 />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationBar result={data} onPageChange={setPage} />

      <AddressFormSheet open={formOpen} onOpenChange={setFormOpen} address={editingAddress} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer cette adresse ?"
        description="Cette adresse sera supprimée définitivement."
        onConfirm={confirmDelete}
        pending={deleteAddress.isPending}
      />
    </div>
  );
}
