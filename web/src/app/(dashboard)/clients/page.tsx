"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2, Users } from "lucide-react";
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
import { ClientFormSheet } from "@/components/clients/client-form-sheet";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { SearchInput } from "@/components/layout/search-input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useClientsQuery, useDeleteClient } from "@/hooks/use-clients";
import type { ClientRecord } from "@/lib/types";

export default function ClientsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading } = useClientsQuery(page, debouncedSearch);
  const deleteClient = useDeleteClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRecord | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ClientRecord | undefined>(undefined);

  function openCreate() {
    setEditingClient(undefined);
    setFormOpen(true);
  }

  function openEdit(client: ClientRecord) {
    setEditingClient(client);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteClient.mutateAsync(deleteTarget.id);
      toast.success("Client supprimé.");
      setDeleteTarget(undefined);
    } catch {
      toast.error("Impossible de supprimer ce client.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Gérez le répertoire de vos clients."
        action={
          <Button onClick={openCreate}>
            <Plus />
            Nouveau client
          </Button>
        }
      />

      <div className="mb-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Rechercher un client…" />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={debouncedSearch ? "Aucun client trouvé" : "Aucun client pour l'instant"}
          description={
            debouncedSearch
              ? "Essayez une autre recherche."
              : "Ajoutez votre premier client pour commencer à gérer vos projets et factures."
          }
          action={
            !debouncedSearch && (
              <Button onClick={openCreate}>
                <Plus />
                Nouveau client
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Courriel</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead className="text-center">Adresses</TableHead>
                <TableHead className="text-center">Projets</TableHead>
                <TableHead className="text-center">Factures</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((clientItem) => (
                <TableRow key={clientItem.id}>
                  <TableCell className="font-medium">{clientItem.name}</TableCell>
                  <TableCell className="text-muted-foreground">{clientItem.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{clientItem.phone ?? "—"}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{clientItem.addressCount}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{clientItem.projectCount}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{clientItem.invoiceCount}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEdit(clientItem)}>
                          <Pencil />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(clientItem)}>
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

      <ClientFormSheet open={formOpen} onOpenChange={setFormOpen} client={editingClient} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer ce client ?"
        description={`« ${deleteTarget?.name} » et toutes ses adresses, projets et factures associés seront supprimés définitivement.`}
        onConfirm={confirmDelete}
        pending={deleteClient.isPending}
      />
    </div>
  );
}
