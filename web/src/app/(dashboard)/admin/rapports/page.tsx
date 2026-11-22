"use client";

import { useState } from "react";
import { ChartBar, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import { ClickableRow } from "@/components/layout/clickable-row";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PageHeader } from "@/components/layout/page-header";
import { ReportFormSheet } from "@/components/catalog/report-form-sheet";
import {
  useAdminReportsQuery,
  useDeleteReport,
  useReportKeysQuery,
} from "@/hooks/use-reports";
import { ApiError } from "@/lib/api";
import { moduleIcon } from "@/lib/module-icons";
import type { AdminReport } from "@/lib/types";

/**
 * Pattern 1 — List / Index.
 *
 * The catalogue of reports. Each row names the module it belongs to, which is the field that
 * decides who is offered it: a plan includes modules, so attaching a report to the right one is
 * the whole of its distribution.
 */
export default function AdminReportsPage() {
  // A failed read is not a platform without reports: `!data` alone would invite the admin to
  // re-create a catalogue that already exists. And `isError` alone is too wide — a failed
  // background refetch keeps it true over rows that are still right.
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } =
    useAdminReportsQuery();
  const { data: keys } = useReportKeysQuery();
  const deleteReport = useDeleteReport();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminReport | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<AdminReport | undefined>(undefined);

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(report: AdminReport) {
    setEditing(report);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteReport.mutateAsync(deleteTarget.id);
      toast.success("Rapport supprimé.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Impossible de supprimer ce rapport.",
      );
    }
  }

  const createButton = (
    <Button onClick={openCreate}>
      <Plus />
      Nouveau rapport
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Rapports"
        description="Ce que chaque entreprise peut consulter. Un rapport suit le module auquel il est attaché."
        action={createButton}
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        <LoadErrorState
          error={loadError}
          title="Rapports indisponibles"
          fallback="Le catalogue de rapports n'a pas pu être chargé."
          onRetry={() => refetch()}
        />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={ChartBar}
          title="Aucun rapport pour l'instant"
          description="Créez les rapports et attachez chacun au module qui le vend. Les entreprises ne voient que ceux de leur forfait."
          action={createButton}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Icône</TableHead>
                <TableHead>Titre</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Calcul</TableHead>
                <TableHead className="w-20">Ordre</TableHead>
                <TableHead className="w-28">Statut</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((report) => {
                const Icon = moduleIcon(report.icon);
                const option = keys?.find((k) => k.key === report.key);

                return (
                  <ClickableRow
                    key={report.id}
                    label={`Modifier ${report.title}`}
                    onOpen={() => openEdit(report)}
                  >
                    <TableCell>
                      <Icon className="size-4 text-muted-foreground" />
                    </TableCell>
                    <TableCell className="font-medium">
                      {report.title}
                      <div className="max-w-sm truncate text-xs font-normal text-muted-foreground">
                        {report.description}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{report.moduleTitle}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="flex flex-col">
                        <span>{option?.label ?? report.key}</span>
                        {/* Said here rather than only in the form: a catalogue where half the
                            rows open on a placeholder is something the platform should be able
                            to see at a glance. */}
                        {option && !option.isImplemented && (
                          <span className="text-xs">Calcul à venir</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {report.sortOrder}
                    </TableCell>
                    <TableCell>
                      <Badge variant={report.isPublished ? "default" : "outline"}>
                        {report.isPublished ? "Publié" : "Masqué"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon" aria-label="Actions" />}
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(report)}>
                            <Pencil />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteTarget(report)}
                          >
                            <Trash2 />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </ClickableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ReportFormSheet open={formOpen} onOpenChange={setFormOpen} report={editing} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => !next && setDeleteTarget(undefined)}
        title="Supprimer ce rapport ?"
        description={
          deleteTarget
            ? `« ${deleteTarget.title} » ne sera plus proposé à aucune entreprise. Aucune donnée n'est supprimée.`
            : ""
        }
        onConfirm={confirmDelete}
        pending={deleteReport.isPending}
      />
    </div>
  );
}
