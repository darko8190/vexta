"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, MoreHorizontal, Pencil, Plus, Trash2, Users } from "lucide-react";
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
import { ClickableRow } from "@/components/layout/clickable-row";
import { PageHeader } from "@/components/layout/page-header";
import { UpgradeCta } from "@/components/layout/upgrade-cta";
import { useCanCreate } from "@/hooks/use-can-create";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { SearchInput } from "@/components/layout/search-input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useClientsQuery, useDeleteClient } from "@/hooks/use-clients";
import { formatClientNumber, type ClientRecord } from "@/lib/types";

export default function ClientsPage() {
  const router = useRouter();
  const canCreate = useCanCreate();
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
          canCreate ? (
            <Button onClick={openCreate}>
              <Plus />
              Nouveau client
            </Button>
          ) : (
            <UpgradeCta />
          )
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
              : canCreate
                ? "Ajoutez votre premier client pour commencer à gérer vos projets et factures."
                : "La création de fiches est réservée aux comptes entreprise."
          }
          action={
            !debouncedSearch &&
            (canCreate ? (
              <Button onClick={openCreate}>
                <Plus />
                Nouveau client
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
                <TableHead className="w-24">Numéro</TableHead>
                <TableHead>Nom</TableHead>
                {/* Hidden on narrow screens: the name and number are what identify a row, and
                    the rest is one tap away on the client's own page. */}
                <TableHead className="hidden md:table-cell">Courriel</TableHead>
                <TableHead className="hidden lg:table-cell">Téléphone</TableHead>
                <TableHead className="hidden text-center sm:table-cell">Projets</TableHead>
                <TableHead className="hidden text-center sm:table-cell">Factures</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((clientItem) => (
                <ClickableRow
                  key={clientItem.id}
                  label={`Ouvrir la fiche de ${clientItem.name}`}
                  onOpen={() => router.push(`/clients/${clientItem.id}`)}
                >
                  <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
                    {formatClientNumber(clientItem.number)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/clients/${clientItem.id}`}
                      className="group/name inline-flex items-center gap-1.5 font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {clientItem.name}
                      <ExternalLink className="size-3 opacity-0 transition-opacity group-hover/name:opacity-60" />
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {clientItem.type === "Entreprise" ? "Entreprise" : "Particulier"}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{clientItem.email ?? "—"}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{clientItem.phone ?? "—"}</TableCell>
                  <TableCell className="hidden text-center sm:table-cell">
                    <Badge variant="secondary">{clientItem.projectCount}</Badge>
                  </TableCell>
                  <TableCell className="hidden text-center sm:table-cell">
                    <Badge variant="secondary">{clientItem.invoiceCount}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem render={<Link href={`/clients/${clientItem.id}`} />}>
                          <ExternalLink />
                          Ouvrir la fiche
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(clientItem)}>
                          <Pencil />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(clientItem)}>
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
