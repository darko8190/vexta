"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, FolderKanban, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { DataTable, type DataColumn } from "@/components/layout/data-table";
import { PageHeader } from "@/components/layout/page-header";
import { TemplateLibraryButton } from "@/components/templates/template-library";
import { UpgradeCta } from "@/components/layout/upgrade-cta";
import { useCanCreate, useIsClientUser } from "@/hooks/use-can-create";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { SearchInput } from "@/components/layout/search-input";
import { ProjectFormSheet, storedValues } from "@/components/projects/project-form-sheet";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useDeleteProject, useProjectsQuery, useUpdateProject } from "@/hooks/use-projects";
import { projectStatusBadgeVariant, projectStatusLabels } from "@/lib/labels";
import { formatProjectNumber, type ProjectRecord, type ProjectStatus } from "@/lib/types";
import { filtersToQuery, type TableFilters } from "@/lib/table-filters";
import { NUMBER_DESC, sortToQuery, type SortState } from "@/lib/table-sort";
import { useClientSummaryQuery } from "@/hooks/use-clients";
import { useProjectCategoriesQuery } from "@/hooks/use-project-categories";
import { StatusPills, useStatusCountsQuery } from "@/components/layout/status-pills";

function formatCurrency(amount: number | null) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(amount);
}

export default function ProjectsPage() {
  const router = useRouter();
  const canCreate = useCanCreate();
  const isClient = useIsClientUser();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const [filters, setFilters] = useState<TableFilters>({});
  const [sort, setSort] = useState<SortState>(NUMBER_DESC);
  const [status, setStatus] = useState<ProjectStatus | "">("");
  const { data, isLoading } = useProjectsQuery(
    page,
    debouncedSearch,
    undefined,
    status || undefined,
    undefined,
    { ...filtersToQuery(filters), ...sortToQuery(sort) },
  );
  const { data: statusCounts } = useStatusCountsQuery("projects", "projects/statuts");
  // The options of the two reference columns. A customer sees only their own jobs, so the
  // client column offers nothing to them.
  const { data: clientOptions } = useClientSummaryQuery(!isClient);
  const { data: categories } = useProjectCategoriesQuery();
  const deleteProject = useDeleteProject();
  const updateProject = useUpdateProject();

  const [formOpen, setFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectRecord | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRecord | undefined>(undefined);

  function openCreate() {
    setEditingProject(undefined);
    setFormOpen(true);
  }

  function openEdit(project: ProjectRecord) {
    setEditingProject(project);
    setFormOpen(true);
  }

  async function saveRow(projectItem: ProjectRecord, changes: Record<string, string>) {
    const values = storedValues(projectItem);
    if ("description" in changes) values.description = changes.description;
    if ("statut" in changes) values.status = changes.statut as ProjectStatus;
    if ("debut" in changes) values.startDate = changes.debut || null;
    if ("fin" in changes) values.endDate = changes.fin || null;
    if ("budget" in changes) values.budget = changes.budget ? Number(changes.budget) : null;
    if ("po" in changes) values.poNumber = changes.po.trim() || null;
    await updateProject.mutateAsync({ id: projectItem.id, values });
  }

  const columns: DataColumn<ProjectRecord>[] = [
    {
      key: "numero",
      sortable: true,
      filter: { type: "number" },
      label: "Numéro",
      locked: true,
      headClassName: "w-24",
      cellClassName: "font-mono text-xs font-medium tabular-nums",
      cell: (projectItem) => formatProjectNumber(projectItem.number),
    },
    { key: "client",
      sortable: true, filter: isClient ? undefined : { type: "select", options: (clientOptions ?? []).map((c) => ({ value: c.id, label: c.name })) }, label: "Client", cellClassName: "font-medium", cell: (projectItem) => projectItem.clientName },
    {
      key: "description",
      sortable: true,
      filter: { type: "text" },
      label: "Description",
      cellClassName: "max-w-xs truncate text-muted-foreground",
      cell: (projectItem) => projectItem.description || "—",
      edit: { type: "text", value: (projectItem) => projectItem.description ?? "" },
    },
    {
      key: "statut",
      sortable: true,
      filter: { type: "select", options: (Object.keys(projectStatusLabels) as ProjectStatus[]).map((status) => ({ value: status, label: projectStatusLabels[status] })) },
      label: "Statut",
      cell: (projectItem) => (
        <Badge variant={projectStatusBadgeVariant[projectItem.status]}>
          {projectStatusLabels[projectItem.status]}
        </Badge>
      ),
      edit: {
        type: "select",
        value: (projectItem) => projectItem.status,
        options: (Object.keys(projectStatusLabels) as ProjectStatus[]).map((status) => ({
          value: status,
          label: projectStatusLabels[status],
        })),
      },
    },
    {
      key: "debut",
      sortable: true,
      filter: { type: "date" },
      label: "Début",
      cellClassName: "text-muted-foreground",
      cell: (projectItem) => projectItem.startDate ?? "—",
      edit: { type: "date", value: (projectItem) => projectItem.startDate ?? "" },
    },
    {
      key: "fin",
      sortable: true,
      filter: { type: "date" },
      label: "Fin",
      cellClassName: "text-muted-foreground",
      cell: (projectItem) => projectItem.endDate ?? "—",
      edit: { type: "date", value: (projectItem) => projectItem.endDate ?? "" },
    },
    {
      key: "budget",
      sortable: true,
      filter: { type: "number" },
      label: "Budget",
      cellClassName: "text-muted-foreground tabular-nums",
      cell: (projectItem) => formatCurrency(projectItem.budget),
      edit: { type: "number", value: (projectItem) => (projectItem.budget != null ? String(projectItem.budget) : "") },
    },
    {
      key: "po",
      sortable: true,
      filter: { type: "text" },
      label: "PO",
      hiddenByDefault: true,
      cellClassName: "text-muted-foreground",
      cell: (projectItem) => projectItem.poNumber || "—",
      edit: { type: "text", value: (projectItem) => projectItem.poNumber ?? "" },
    },
    {
      key: "categorie",
      filter: { type: "select", options: (categories ?? []).map((c) => ({ value: c.id, label: c.name })) },
      label: "Catégorie",
      hiddenByDefault: true,
      cellClassName: "text-muted-foreground",
      cell: (projectItem) =>
        projectItem.categoryName
          ? `${projectItem.categoryName}${projectItem.subCategoryName ? ` › ${projectItem.subCategoryName}` : ""}`
          : "—",
    },
    {
      key: "actif",
      filter: { type: "text" },
      label: "Actif",
      hiddenByDefault: true,
      cellClassName: "text-muted-foreground",
      cell: (projectItem) => projectItem.clientAssetLabel ?? "—",
    },
  ];

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteProject.mutateAsync(deleteTarget.id);
      toast.success("Projet supprimé.");
      setDeleteTarget(undefined);
    } catch {
      toast.error("Impossible de supprimer ce projet.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Projets"
        description={isClient ? "Les mandats que votre fournisseur suit pour vous." : "Suivez l'avancement des mandats pour vos clients."}
        action={
          canCreate ? (
            <div className="flex flex-wrap gap-2">
              <TemplateLibraryButton kind="projet" />
              <Button onClick={openCreate}>
                <Plus />
                Nouveau projet
              </Button>
            </div>
          ) : isClient ? null : (
            <UpgradeCta />
          )
        }
      />

      <div className="mb-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Rechercher un projet…" />
      </div>

      <StatusPills
        options={(Object.keys(projectStatusLabels) as ProjectStatus[]).map((value) => ({ value, label: projectStatusLabels[value] }))}
        value={status}
        onChange={(next) => {
          setStatus(next);
          setPage(1);
        }}
        counts={statusCounts}
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data || (data.items.length === 0 && Object.keys(filters).length === 0 && !status) ? (
        <EmptyState
          icon={FolderKanban}
          title={debouncedSearch ? "Aucun projet trouvé" : "Aucun projet pour l'instant"}
          description={
            debouncedSearch
              ? "Essayez une autre recherche."
              : canCreate
                ? "Créez votre premier projet pour un client."
                : isClient
                  ? "Aucun projet ne vous est rattaché pour l'instant."
                  : "La création de fiches est réservée aux comptes entreprise."
          }
          action={
            !debouncedSearch && !isClient &&
            (canCreate ? (
              <Button onClick={openCreate}>
                <Plus />
                Nouveau projet
              </Button>
            ) : (
              <UpgradeCta />
            ))
          }
        />
      ) : (
        <DataTable
          id="projets"
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
          getRowId={(projectItem) => projectItem.id}
          rowLabel={(projectItem) => `Ouvrir le projet ${formatProjectNumber(projectItem.number)}`}
          onOpen={(projectItem) => router.push(`/projets/${projectItem.id}`)}
          onSaveRow={canCreate && !isClient ? saveRow : undefined}
          actions={
            isClient
              ? undefined
              : (projectItem) => (
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem render={<Link href={`/projets/${projectItem.id}`} />}>
                        <ExternalLink />
                        Ouvrir la fiche
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEdit(projectItem)}>
                        <Pencil />
                        Modifier
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(projectItem)}>
                        <Trash2 />
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
          }
        />
      )}

      <PaginationBar result={data} onPageChange={setPage} />

      <ProjectFormSheet open={formOpen} onOpenChange={setFormOpen} project={editingProject} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer ce projet ?"
        description={`Le projet ${deleteTarget ? formatProjectNumber(deleteTarget.number) : ""} sera supprimé et ses factures liées seront détachées. Cette action est définitive.`}
        onConfirm={confirmDelete}
        pending={deleteProject.isPending}
      />
    </div>
  );
}
