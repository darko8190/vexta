"use client";

import { useRef, useState } from "react";
import { ExternalLink, Images, MoreHorizontal, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { SearchInput } from "@/components/layout/search-input";
import { UpgradeCta } from "@/components/layout/upgrade-cta";
import { useCanCreate } from "@/hooks/use-can-create";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  MAX_UPLOAD_BYTES,
  useDeleteMedia,
  useMediaLink,
  useMediaQuery,
  useRenameMedia,
  useUploadMedia,
} from "@/hooks/use-media";
import { ApiError } from "@/lib/api";
import type { MediaAssetRecord } from "@/lib/types";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/**
 * How much the stored file is smaller than the one that was chosen, or null when it is stored
 * as-is. Shown as a saving because that is what it is: the bill is on the stored size.
 */
function savedPercent(asset: MediaAssetRecord) {
  if (!asset.contentEncoding || asset.originalSizeBytes <= asset.sizeBytes) return null;

  const saved = Math.round((1 - asset.sizeBytes / asset.originalSizeBytes) * 100);
  return saved >= 1 ? saved : null;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium" }).format(new Date(iso));
}

export default function MediaLibraryPage() {
  const canCreate = useCanCreate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading } = useMediaQuery(page, debouncedSearch);
  const upload = useUploadMedia();
  const rename = useRenameMedia();
  const deleteMedia = useDeleteMedia();
  const mediaLink = useMediaLink();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [renameTarget, setRenameTarget] = useState<MediaAssetRecord | undefined>(undefined);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MediaAssetRecord | undefined>(undefined);

  async function onFilesChosen(files: FileList | null) {
    if (!files || files.length === 0) return;

    // Sequential, not parallel: a signed URL per file, and a clear count at the end.
    let done = 0;
    for (const file of Array.from(files)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`« ${file.name} » dépasse 50 Mo.`);
        continue;
      }

      try {
        await upload.mutateAsync(file);
        done += 1;
      } catch (error) {
        const message =
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Transfert impossible.";
        toast.error(`« ${file.name} » n'a pas été téléversé. ${message}`);
      }
    }

    if (done > 0) {
      toast.success(done === 1 ? "Fichier ajouté." : `${done} fichiers ajoutés.`);
    }

    // Lets the same file be chosen again right after a failure.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function openAsset(asset: MediaAssetRecord) {
    // The tab is opened before awaiting anything: a window.open that happens after an await has
    // lost the user gesture, and pop-up blockers refuse it.
    const tab = window.open("", "_blank");

    try {
      const { url } = await mediaLink.mutateAsync(asset.id);

      if (tab) {
        tab.location.href = url;
      } else {
        toast.error("Votre navigateur a bloqué l'ouverture. Autorisez les fenêtres pour ce site.");
      }
    } catch (error) {
      tab?.close();
      toast.error(error instanceof ApiError ? error.message : "Impossible d'ouvrir ce fichier.");
    }
  }

  async function confirmRename() {
    if (!renameTarget) return;
    const fileName = renameValue.trim();
    if (!fileName) return;

    try {
      await rename.mutateAsync({ id: renameTarget.id, fileName });
      toast.success("Fichier renommé.");
      setRenameTarget(undefined);
    } catch {
      toast.error("Impossible de renommer ce fichier.");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMedia.mutateAsync(deleteTarget.id);
      toast.success("Fichier supprimé.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer ce fichier.");
    }
  }

  // One button, possibly rendered twice (header and empty state), but a single file input: two
  // inputs sharing one ref would leave the header button driving the other one's element.
  const uploadButton = (
    <Button onClick={() => fileInputRef.current?.click()} disabled={upload.isPending}>
      {upload.isPending ? <Spinner /> : <Upload />}
      Téléverser
    </Button>
  );

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => onFilesChosen(event.target.files)}
      />

      <PageHeader
        title="Bibliothèque"
        description="Vos plans, photos et documents, rangés au même endroit."
        action={canCreate ? uploadButton : <UpgradeCta />}
      />

      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Rechercher un fichier…"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={Images}
          title={debouncedSearch ? "Aucun fichier trouvé" : "Aucun fichier pour l'instant"}
          description={
            debouncedSearch
              ? "Essayez une autre recherche."
              : canCreate
                ? "Téléversez un plan, une photo de chantier ou un contrat."
                : "La bibliothèque est réservée aux comptes entreprise."
          }
          action={!debouncedSearch && (canCreate ? uploadButton : <UpgradeCta />)}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fichier</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Taille</TableHead>
                <TableHead>Ajouté le</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="font-medium">{asset.fileName}</TableCell>
                  <TableCell className="text-muted-foreground">{asset.contentType}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {formatSize(asset.sizeBytes)}
                    {savedPercent(asset) !== null && (
                      <span
                        className="block text-xs"
                        title={`Compressé à l'envoi : ${formatSize(asset.originalSizeBytes)} à l'origine. Le fichier est restitué intact.`}
                      >
                        −{savedPercent(asset)} % compressé
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(asset.createdAt)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openAsset(asset)}>
                          <ExternalLink />
                          Ouvrir
                        </DropdownMenuItem>
                        {canCreate && (
                          <DropdownMenuItem
                            onClick={() => {
                              setRenameTarget(asset);
                              setRenameValue(asset.fileName);
                            }}
                          >
                            <Pencil />
                            Renommer
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(asset)}>
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

      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renommer le fichier</DialogTitle>
            <DialogDescription>
              Seul le nom affiché change. Le fichier lui-même reste au même endroit dans R2.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="media-rename">Nom du fichier</FieldLabel>
            <Input
              id="media-rename"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(undefined)}>
              Annuler
            </Button>
            <Button onClick={confirmRename} disabled={rename.isPending || !renameValue.trim()}>
              {rename.isPending && <Spinner />}
              Renommer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer ce fichier ?"
        description={`« ${deleteTarget?.fileName} » sera retiré de la bibliothèque et effacé de R2. Cette action est définitive.`}
        onConfirm={confirmDelete}
        pending={deleteMedia.isPending}
      />
    </div>
  );
}
