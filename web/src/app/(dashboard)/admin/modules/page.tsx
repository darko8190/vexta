"use client";

import { useState } from "react";
import { Blocks, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import { PageHeader } from "@/components/layout/page-header";
import { ModuleFormSheet } from "@/components/catalog/module-form-sheet";
import { useDeleteModule, useModulesQuery } from "@/hooks/use-catalog";
import { ApiError } from "@/lib/api";
import { moduleIcon } from "@/lib/module-icons";
import type { ModuleRecord } from "@/lib/types";

export default function ModulesPage() {
  const { data, isLoading } = useModulesQuery();
  const deleteModule = useDeleteModule();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ModuleRecord | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ModuleRecord | undefined>(undefined);

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteModule.mutateAsync(deleteTarget.id);
      toast.success("Module supprimé.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer ce module.");
    }
  }

  const createButton = (
    <Button onClick={openCreate}>
      <Plus />
      Nouveau module
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Modules"
        description="Les capacités présentées sur le site public et cochées dans chaque forfait."
        action={createButton}
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Blocks}
          title="Aucun module pour l'instant"
          description="Créez les modules qui décrivent ce que Vexta fait. Ils composent la grille du site public."
          action={createButton}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Icône</TableHead>
                <TableHead>Titre</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-24">Ordre</TableHead>
                <TableHead className="w-28">Statut</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((module) => {
                const Icon = moduleIcon(module.icon);
                return (
                  <TableRow key={module.id}>
                    <TableCell>
                      <Icon className="size-4 text-muted-foreground" />
                    </TableCell>
                    <TableCell className="font-medium">{module.title}</TableCell>
                    <TableCell className="max-w-md truncate text-muted-foreground">
                      {module.description}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{module.sortOrder}</TableCell>
                    <TableCell>
                      <Badge variant={module.isPublished ? "default" : "outline"}>
                        {module.isPublished ? "Publié" : "Masqué"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(module);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(module)}>
                            <Trash2 />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ModuleFormSheet open={formOpen} onOpenChange={setFormOpen} module={editing} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer ce module ?"
        description={`« ${deleteTarget?.title} » disparaîtra du site public. Un module inclus dans un forfait ne peut pas être supprimé.`}
        onConfirm={confirmDelete}
        pending={deleteModule.isPending}
      />
    </div>
  );
}
