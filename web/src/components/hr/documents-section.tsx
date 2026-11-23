"use client";

import { useRef, useState } from "react";
import { Download, FileText, MoreHorizontal, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { EmptyState } from "@/components/layout/empty-state";
import { useDeleteDocument, useDocumentsQuery, useSaveDocument } from "@/hooks/use-hr";
import { useTeamQuery } from "@/hooks/use-team";
import { useMediaLink, useUploadMedia } from "@/hooks/use-media";
import { ApiError } from "@/lib/api";
import type { HrDocument } from "@/lib/types";
import { ex } from "@/lib/placeholders";

const WHOLE_COMPANY = "entreprise";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function UploadSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const upload = useUploadMedia();
  const save = useSaveDocument();
  const { data: staff } = useTeamQuery();
  const employees = staff?.employees ?? [];

  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [employeeId, setEmployeeId] = useState(WHOLE_COMPANY);

  const pending = upload.isPending || save.isPending;

  function reset() {
    setFile(null);
    setTitle("");
    setCategory("");
    setEmployeeId(WHOLE_COMPANY);
  }

  async function onSubmit() {
    if (!file) {
      toast.error("Choisissez un fichier.");
      return;
    }
    if (!title.trim()) {
      toast.error("Donnez un titre au document.");
      return;
    }

    try {
      // Two steps on purpose: the file goes to R2 first, and only a stored file gets an HR
      // entry. The reverse order would leave rows pointing at nothing.
      const asset = await upload.mutateAsync(file);
      await save.mutateAsync({
        title: title.trim(),
        category: category.trim() || null,
        employeeId: employeeId === WHOLE_COMPANY ? null : employeeId,
        mediaAssetId: asset.id,
      });
      toast.success("Document ajouté.");
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Impossible d'ajouter ce document.",
      );
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Nouveau document</SheetTitle>
          <SheetDescription>
            Un contrat, une politique, une certification. Le fichier est rangé dans la bibliothèque.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-4">
          <Field>
            <FieldLabel htmlFor="document-file">Fichier</FieldLabel>
            <input
              ref={fileInput}
              id="document-file"
              type="file"
              className="sr-only"
              onChange={(event) => {
                const chosen = event.target.files?.[0] ?? null;
                setFile(chosen);
                // Saves typing the obvious: the file name is almost always the title.
                if (chosen && !title) setTitle(chosen.name.replace(/\.[^.]+$/, ""));
                event.target.value = "";
              }}
            />
            <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
              <Upload />
              {file ? "Changer de fichier" : "Choisir un fichier"}
            </Button>
            <FieldDescription>
              {file ? `${file.name} — ${formatSize(file.size)}` : "Aucun fichier choisi."}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="document-title">Titre</FieldLabel>
            <Input
              id="document-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={ex("Contrat de travail")}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="document-category">Catégorie</FieldLabel>
            <Input
              id="document-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder={ex("Contrat")}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="document-employee">Concerne</FieldLabel>
            {/* Base UI hands back null when a select is cleared; the sentinel is the fallback. */}
            <Select value={employeeId} onValueChange={(value) => setEmployeeId(value ?? WHOLE_COMPANY)}>
              <SelectTrigger id="document-employee" className="w-full">
                <SelectValue>
                  {employeeId === WHOLE_COMPANY
                    ? "Toute l'entreprise"
                    : (() => {
                        const match = employees.find((e) => e.id === employeeId);
                        return match ? `${match.firstName} ${match.lastName}` : "Toute l'entreprise";
                      })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={WHOLE_COMPANY}>Toute l&apos;entreprise</SelectItem>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.firstName} {employee.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <SheetFooter>
          <Button type="button" onClick={onSubmit} disabled={pending}>
            {pending && <Spinner />}
            Ajouter le document
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function DocumentsSection() {
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } = useDocumentsQuery();
  const remove = useDeleteDocument();
  const link = useMediaLink();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HrDocument | undefined>(undefined);

  async function openFile(document: HrDocument) {
    try {
      const { url } = await link.mutateAsync(document.mediaAssetId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'ouvrir ce fichier.");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Document retiré.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de retirer ce document.");
    }
  }

  const addButton = (
    <Button onClick={() => setUploadOpen(true)}>
      <Upload />
      Nouveau document
    </Button>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Documents</h2>
          <p className="text-sm text-muted-foreground">
            Contrats, politiques, certifications — rattachés à une personne ou à toute l&apos;entreprise.
          </p>
        </div>
        {addButton}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        /* An error is not an empty list. "Aucun document" after a failed request tells
           someone their contracts are gone, when they were simply not read.
           And `isError` alone is too wide: a failed background refetch keeps it true over rows
           that are still right, so the panel only wins with nothing read at all (`!data`) or rows
           left over from another query key (`isPlaceholderData`). */
        <LoadErrorState
          error={loadError}
          title="Documents indisponibles"
          fallback="Vos documents n'ont pas pu être chargés."
          onRetry={() => refetch()}
        />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucun document"
          description="Déposez vos contrats et vos politiques ici. Le stockage Cloudflare R2 doit être configuré par l'administrateur de la plateforme."
          action={addButton}
        />
      ) : (
        <ul className="space-y-2">
          {data.map((document) => (
            <li key={document.id} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
              <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{document.title}</span>
                  {document.category && <Badge variant="secondary">{document.category}</Badge>}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {document.employeeName ?? "Toute l'entreprise"} · {document.fileName} ·{" "}
                  {formatSize(document.sizeBytes)}
                </p>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions pour ${document.title}`} />}>
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openFile(document)}>
                    <Download />
                    Ouvrir le fichier
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(document)}>
                    <Trash2 />
                    Retirer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <UploadSheet open={uploadOpen} onOpenChange={setUploadOpen} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Retirer ce document ?"
        description={`« ${deleteTarget?.title} » quittera les ressources humaines. Le fichier reste dans la bibliothèque.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
