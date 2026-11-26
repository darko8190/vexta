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
import { ClientFormSheet } from "@/components/clients/client-form-sheet";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { DataTable, type DataColumn } from "@/components/layout/data-table";
import { PageHeader } from "@/components/layout/page-header";
import { WorkbookMenu } from "@/components/import-export/workbook-menu";
import { UpgradeCta } from "@/components/layout/upgrade-cta";
import { useCanCreate } from "@/hooks/use-can-create";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { SearchInput } from "@/components/layout/search-input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { storedClientValues, useClientsQuery, useDeleteClient, useUpdateClient } from "@/hooks/use-clients";
import { clientStatusBadge, clientStatusLabels } from "@/lib/labels";
import { formatClientNumber, type ClientRecord, type ClientStatus } from "@/lib/types";
import { filtersToQuery, type TableFilters } from "@/lib/table-filters";
import { NUMBER_DESC, sortToQuery, type SortState } from "@/lib/table-sort";
import { StatusPills, useStatusCountsQuery } from "@/components/layout/status-pills";

/** The filter's own values: the three states, the lock, and everybody. */
type StatusFilter = ClientStatus | "Bloques" | "Tous";

const statusFilterLabels: Record<StatusFilter, string> = {
  Tous: "Tous les clients",
  Prospect: "Prospects",
  Client: "Clients",
  Ancien: "Anciens clients",
  Bloques: "Bloqués",
};

export default function ClientsPage() {
  const router = useRouter();
  const canCreate = useCanCreate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Tous");
  const debouncedSearch = useDebouncedValue(search);

  const [filters, setFilters] = useState<TableFilters>({});
  const [sort, setSort] = useState<SortState>(NUMBER_DESC);
  const { data, isLoading } = useClientsQuery(
    page,
    debouncedSearch,
    statusFilter === "Tous" ? undefined : statusFilter,
    { ...filtersToQuery(filters), ...sortToQuery(sort) },
  );
  const { data: statusCounts } = useStatusCountsQuery("clients", "clients/statuts");
  const deleteClient = useDeleteClient();
  const updateClient = useUpdateClient();

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

  async function saveRow(clientItem: ClientRecord, changes: Record<string, string>) {
    const values = storedClientValues(clientItem);
    if ("courriel" in changes) values.email = changes.courriel.trim() || null;
    if ("telephone" in changes) values.phone = changes.telephone.trim() || null;
    if ("statut" in changes) values.status = changes.statut as ClientStatus;
    if ("prenom" in changes) values.firstName = changes.prenom.trim();
    if ("nomFamille" in changes) values.lastName = changes.nomFamille.trim();
    if ("entreprise" in changes && clientItem.type === "Entreprise") values.companyName = changes.entreprise.trim();
    await updateClient.mutateAsync({ id: clientItem.id, values });
  }

  const columns: DataColumn<ClientRecord>[] = [
    {
      key: "numero",
      sortable: true,
      filter: { type: "number" },
      label: "Numéro",
      locked: true,
      headClassName: "w-24",
      cellClassName: "font-mono text-xs text-muted-foreground tabular-nums",
      cell: (clientItem) => formatClientNumber(clientItem.number),
    },
    {
      key: "nom",
      sortable: true,
      filter: { type: "text" },
      label: "Nom",
      cell: (clientItem) => (
        <>
          <span className="font-medium text-foreground">{clientItem.name}</span>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {clientItem.type === "Entreprise" ? "Entreprise" : "Particulier"}
            </span>
            {/* One badge, never two: the lock wins over the state. */}
            <Badge variant={clientStatusBadge(clientItem).variant} className="text-[10px]">
              {clientStatusBadge(clientItem).label}
            </Badge>
          </div>
        </>
      ),
    },
    {
      key: "entreprise",
      sortable: true,
      filter: { type: "text" },
      label: "Nom de l'entreprise",
      hiddenByDefault: true,
      cellClassName: "text-muted-foreground",
      cell: (clientItem) => clientItem.companyName ?? "—",
      edit: { type: "text", value: (clientItem) => clientItem.companyName ?? "" },
    },
    {
      key: "prenom",
      sortable: true,
      filter: { type: "text" },
      label: "Prénom",
      hiddenByDefault: true,
      cellClassName: "text-muted-foreground",
      cell: (clientItem) => clientItem.firstName ?? "—",
      edit: { type: "text", value: (clientItem) => clientItem.firstName ?? "" },
    },
    {
      key: "nomFamille",
      sortable: true,
      filter: { type: "text" },
      label: "Nom de famille",
      hiddenByDefault: true,
      cellClassName: "text-muted-foreground",
      cell: (clientItem) => clientItem.lastName ?? "—",
      edit: { type: "text", value: (clientItem) => clientItem.lastName ?? "" },
    },
    {
      key: "statut",
      sortable: true,
      filter: { type: "select", options: (Object.keys(clientStatusLabels) as ClientStatus[]).map((status) => ({ value: status, label: clientStatusLabels[status] })) },
      label: "État",
      hiddenByDefault: true,
      cell: (clientItem) => clientStatusLabels[clientItem.status],
      edit: {
        type: "select",
        value: (clientItem) => clientItem.status,
        options: (Object.keys(clientStatusLabels) as ClientStatus[]).map((status) => ({
          value: status,
          label: clientStatusLabels[status],
        })),
      },
    },
    {
      key: "courriel",
      sortable: true,
      filter: { type: "text" },
      label: "Courriel",
      cellClassName: "text-muted-foreground",
      cell: (clientItem) => clientItem.email ?? "—",
      edit: { type: "text", value: (clientItem) => clientItem.email ?? "" },
    },
    {
      key: "telephone",
      sortable: true,
      filter: { type: "text" },
      label: "Téléphone",
      cellClassName: "text-muted-foreground",
      cell: (clientItem) => clientItem.phone ?? "—",
      edit: { type: "text", value: (clientItem) => clientItem.phone ?? "" },
    },
    {
      key: "ville",
      filter: { type: "text" },
      label: "Ville",
      hiddenByDefault: true,
      cellClassName: "text-muted-foreground",
      cell: (clientItem) => clientItem.primaryAddress?.city ?? "—",
    },
    {
      key: "projets",
      sortable: true,
      filter: { type: "number" },
      label: "Projets",
      headClassName: "text-center",
      cellClassName: "text-center",
      cell: (clientItem) => <Badge variant="secondary">{clientItem.projectCount}</Badge>,
    },
    {
      key: "factures",
      sortable: true,
      filter: { type: "number" },
      label: "Factures",
      headClassName: "text-center",
      cellClassName: "text-center",
      cell: (clientItem) => <Badge variant="secondary">{clientItem.invoiceCount}</Badge>,
    },
  ];

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
          <div className="flex flex-wrap items-center gap-2">
            <WorkbookMenu entity="clients" label="clients" />
            {canCreate ? (
              <Button onClick={openCreate}>
                <Plus />
                Nouveau client
              </Button>
            ) : (
              <UpgradeCta />
            )}
          </div>
        }
      />

      <StatusPills
        options={(Object.keys(statusFilterLabels) as StatusFilter[])
          .filter((value) => value !== "Tous")
          .map((value) => ({ value: value as Exclude<StatusFilter, "Tous">, label: statusFilterLabels[value] }))}
        value={statusFilter === "Tous" ? "" : (statusFilter as Exclude<StatusFilter, "Tous">)}
        onChange={(next) => {
          setStatusFilter(next === "" ? "Tous" : next);
          setPage(1);
        }}
        counts={statusCounts}
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="min-w-0 flex-1">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Rechercher un client…" />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data || (data.items.length === 0 && Object.keys(filters).length === 0) ? (
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
        <DataTable
          id="clients"
          filters={filters}
          sort={sort}
          onSortChange={(next) => {
            setSort(next);
            setPage(1);
          }}
          onFiltersChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
          columns={columns}
          rows={data.items}
          getRowId={(clientItem) => clientItem.id}
          rowLabel={(clientItem) => `Ouvrir la fiche de ${clientItem.name}`}
          onOpen={(clientItem) => router.push(`/clients/${clientItem.id}`)}
          onSaveRow={canCreate ? saveRow : undefined}
          actions={(clientItem) => (
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
          )}
        />
      )}

      <PaginationBar result={data} onPageChange={setPage} />

      <ClientFormSheet open={formOpen} onOpenChange={setFormOpen} client={editingClient} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer ce client ?"
        description={`« ${deleteTarget?.name} » ira à la corbeille (Paramètres), avec ses projets et factures. Vous pourrez le restaurer.`}
        onConfirm={confirmDelete}
        pending={deleteClient.isPending}
      />
    </div>
  );
}
