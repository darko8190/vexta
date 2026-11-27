"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Eye, LayoutTemplate, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { useCanManage } from "@/hooks/use-can-create";
import { useDeleteProjectTemplate, useProjectTemplatesQuery } from "@/hooks/use-project-templates";
import { useDeleteQuoteTemplate, useQuoteTemplatesQuery } from "@/hooks/use-quotes";
import { api, ApiError } from "@/lib/api";
import { formatAmount } from "@/lib/money";

export type TemplateKind = "soumission" | "projet";

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  lineCount: number;
  subtotal: number;
}

interface TemplateLine {
  id: string;
  kind: string;
  description: string;
  unit: string | null;
  quantity: number;
  unitCost: number | null;
  unitPrice: number;
  isOptional?: boolean;
}

const kindLabels: Record<string, string> = {
  Tache: "Tâche",
  Materiel: "Matériau",
  Frais: "Frais",
  Equipement: "Équipement",
  Assemblage: "Assemblage",
};

const copy: Record<TemplateKind, { title: string; how: string; empty: string; path: string }> = {
  soumission: {
    title: "Modèles de soumission",
    how: "Créés avec « Enregistrer comme modèle » sur une soumission, choisis avec « Partir d'un modèle » en en créant une.",
    empty: "Aucun modèle de soumission. Ouvrez une soumission et cliquez « Enregistrer comme modèle ».",
    path: "modeles-soumission",
  },
  projet: {
    title: "Modèles de projet",
    how: "Créés avec « Enregistrer comme modèle » sur un projet, choisis avec « Partir d'un modèle » en en créant un.",
    empty: "Aucun modèle de projet. Ouvrez un projet et cliquez « Enregistrer comme modèle ».",
    path: "modeles-projet",
  },
};

/** The button that opens the templates of a kind, beside the list they start records of. */
export function TemplateLibraryButton({ kind }: { kind: TemplateKind }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <LayoutTemplate />
        Modèles
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{copy[kind].title}</DialogTitle>
            <DialogDescription>{copy[kind].how}</DialogDescription>
          </DialogHeader>
          {open && <TemplateLibrary kind={kind} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Every template of a kind: read what each holds, delete the ones no longer used. */
export function TemplateLibrary({ kind }: { kind: TemplateKind }) {
  const quotes = useQuoteTemplatesQuery(kind === "soumission");
  const projects = useProjectTemplatesQuery(kind === "projet");
  const removeQuote = useDeleteQuoteTemplate();
  const removeProject = useDeleteProjectTemplate();
  const canManage = useCanManage();
  const [viewing, setViewing] = useState<TemplateRow | null>(null);
  const [deleting, setDeleting] = useState<TemplateRow | null>(null);

  const { data, isLoading } = kind === "soumission" ? quotes : projects;
  const rows: TemplateRow[] = (data ?? []) as TemplateRow[];
  const remove = kind === "soumission" ? removeQuote : removeProject;

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success("Modèle supprimé.");
      setDeleting(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer le modèle.");
    }
  }

  if (viewing) return <TemplateDetail kind={kind} template={viewing} onBack={() => setViewing(null)} />;

  return (
    <div>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy[kind].empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rows.map((template) => (
            <li key={template.id} className="flex items-center gap-3 px-3 py-2.5">
              <button type="button" onClick={() => setViewing(template)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium text-foreground">{template.name}</p>
                <p className="text-xs text-muted-foreground">
                  {template.lineCount === 0
                    ? "Aucune ligne"
                    : template.lineCount === 1
                      ? "1 ligne"
                      : `${template.lineCount} lignes`}{" "}
                  · {formatAmount(template.subtotal)} avant taxes
                </p>
              </button>
              <Button variant="ghost" size="icon" aria-label={`Voir le modèle ${template.name}`} onClick={() => setViewing(template)}>
                <Eye />
              </Button>
              {canManage && (
                <Button variant="ghost" size="icon" aria-label={`Supprimer le modèle ${template.name}`} onClick={() => setDeleting(template)}>
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Supprimer ce modèle ?"
        description={`Le modèle « ${deleting?.name ?? ""} » sera supprimé. Ce qui a déjà été créé à partir de lui ne change pas.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}

function TemplateDetail({ kind, template, onBack }: { kind: TemplateKind; template: TemplateRow; onBack: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: [copy[kind].path, template.id],
    queryFn: () => api.get<{ lines: TemplateLine[] }>(`${copy[kind].path}/${template.id}`),
  });
  const lines = data?.lines ?? [];

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft />
        Tous les modèles
      </Button>
      <div>
        <p className="font-medium text-foreground">{template.name}</p>
        {template.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{template.description}</p>}
      </div>
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ce modèle n&apos;a pas de lignes : il garde la description et les réglages.</p>
      ) : (
        <div className="max-h-[50vh] overflow-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qté</TableHead>
                <TableHead className="text-right">Vendant</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <Badge variant="secondary">{kindLabels[line.kind] ?? line.kind}</Badge>
                  </TableCell>
                  <TableCell className="max-w-72 whitespace-normal">
                    {line.description}
                    {line.isOptional && <span className="ml-1 text-xs text-muted-foreground">(option)</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(line.unitPrice)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(Math.round(line.quantity * line.unitPrice * 100) / 100)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
