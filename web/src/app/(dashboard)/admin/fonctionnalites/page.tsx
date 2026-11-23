"use client";

import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClickableRow } from "@/components/layout/clickable-row";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PageHeader } from "@/components/layout/page-header";
import { FeatureFormSheet } from "@/components/catalog/feature-form-sheet";
import { useDeleteFeature, useFeaturesQuery } from "@/hooks/use-features";
import { ApiError } from "@/lib/api";
import { moduleIcon } from "@/lib/module-icons";
import type { FeatureRecord } from "@/lib/types";

export default function FeaturesPage() {
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } = useFeaturesQuery();
  const deleteFeature = useDeleteFeature();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FeatureRecord | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<FeatureRecord | undefined>(undefined);

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteFeature.mutateAsync(deleteTarget.id);
      toast.success("Fonctionnalité supprimée.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Impossible de supprimer cette fonctionnalité.",
      );
    }
  }

  const createButton = (
    <Button onClick={openCreate}>
      <Plus />
      Nouvelle fonctionnalité
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Fonctionnalités"
        description="Ce qu'un forfait permet de faire, par opposition à ce qu'il permet d'ouvrir. Les modules sont les onglets ; ceci est ce qui se passe dedans."
        action={createButton}
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        <LoadErrorState
          error={loadError}
          title="Fonctionnalités indisponibles"
          fallback="Les fonctionnalités n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Aucune fonctionnalité"
          description="Vexta en installe deux au démarrage : la lecture de reçus et l'assistant IA. Si cette liste est vide, redémarrez l'API."
          action={createButton}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Icône</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-44">Clé</TableHead>
                <TableHead className="w-32">Forfaits</TableHead>
                <TableHead className="w-28">Tarifs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((feature) => {
                const Icon = moduleIcon(feature.icon);
                return (
                  <ClickableRow
                    key={feature.id}
                    label={`Modifier ${feature.name}`}
                    onOpen={() => {
                      setEditing(feature);
                      setFormOpen(true);
                    }}
                  >
                    <TableCell>
                      <Icon className="size-4 text-muted-foreground" />
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {feature.name}
                      {feature.isBuiltIn && (
                        <Badge variant="secondary" className="ml-2">
                          Vexta
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{feature.description}</TableCell>
                    <TableCell>
                      <code className="font-mono text-xs text-muted-foreground">{feature.key}</code>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {feature.planCount === 0
                        ? "aucun"
                        : `${feature.planCount} forfait${feature.planCount > 1 ? "s" : ""}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant={feature.isPublished ? "default" : "outline"}>
                        {feature.isPublished ? "Affichée" : "Masquée"}
                      </Badge>
                    </TableCell>
                  </ClickableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="mt-4 text-sm text-muted-foreground">
        Une fonctionnalité se coche ensuite sur chaque forfait, dans la page Forfaits. Une
        entreprise dont l&apos;espace n&apos;a aucun forfait les a toutes : c&apos;est le cas de
        tout espace créé à la main.
      </p>

      <FeatureFormSheet open={formOpen} onOpenChange={setFormOpen} feature={editing} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer cette fonctionnalité ?"
        description={`« ${deleteTarget?.name} » disparaîtra des forfaits. Une fonctionnalité incluse dans un forfait ne peut pas être supprimée.`}
        onConfirm={confirmDelete}
        pending={deleteFeature.isPending}
      />
    </div>
  );
}
