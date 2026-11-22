"use client";

import { useState } from "react";
import { FolderKanban, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { ClickableRow } from "@/components/layout/clickable-row";
import { PageHeader } from "@/components/layout/page-header";
import { UpgradeCta } from "@/components/layout/upgrade-cta";
import { useCanCreate, useIsClientUser } from "@/hooks/use-can-create";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { SearchInput } from "@/components/layout/search-input";
import { ProjectFormSheet } from "@/components/projects/project-form-sheet";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useDeleteProject, useProjectsQuery } from "@/hooks/use-projects";
import { projectStatusBadgeVariant, projectStatusLabels } from "@/lib/labels";
import type { ProjectRecord } from "@/lib/types";

function formatCurrency(amount: number | null) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(amount);
}

export default function ProjectsPage() {
  const canCreate = useCanCreate();
  const isClient = useIsClientUser();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading } = useProjectsQuery(page, debouncedSearch);
  const deleteProject = useDeleteProject();

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
            <Button onClick={openCreate}>
              <Plus />
              Nouveau projet
            </Button>
          ) : isClient ? null : (
            <UpgradeCta />
          )
        }
      />

      <div className="mb-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Rechercher un projet…" />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
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
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Projet</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Échéancier</TableHead>
                <TableHead>Budget</TableHead>
                {/* Nothing to offer a customer here: every action behind it is refused. */}
                {!isClient && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((projectItem) => (
                <ClickableRow
                  key={projectItem.id}
                  label={`Modifier ${projectItem.name}`}
                  onOpen={() => openEdit(projectItem)}
                >
                  <TableCell className="font-medium">{projectItem.name}</TableCell>
                  <TableCell className="text-muted-foreground">{projectItem.clientName}</TableCell>
                  <TableCell>
                    <Badge variant={projectStatusBadgeVariant[projectItem.status]}>
                      {projectStatusLabels[projectItem.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {projectItem.startDate ?? "—"} → {projectItem.endDate ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatCurrency(projectItem.budget)}</TableCell>
                  {!isClient && (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
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
                  </TableCell>
                  )}
                </ClickableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationBar result={data} onPageChange={setPage} />

      <ProjectFormSheet open={formOpen} onOpenChange={setFormOpen} project={editingProject} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer ce projet ?"
        description={`« ${deleteTarget?.name} » et ses factures liées seront détachés. Cette action est définitive.`}
        onConfirm={confirmDelete}
        pending={deleteProject.isPending}
      />
    </div>
  );
}
