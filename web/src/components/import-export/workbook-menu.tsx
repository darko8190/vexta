"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, FileUp, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import {
  useDownloadTemplate,
  useExportWorkbook,
  useImportWorkbook,
  type ImportableEntity,
  type ImportResult,
} from "@/hooks/use-import-export";
import { ApiError } from "@/lib/api";

function message(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * The three workbook buttons, folded into one menu.
 *
 * One control rather than three beside the page's own: downloading a template, exporting and
 * importing are the same errand seen from three angles, and three buttons in a row would make
 * the page's actual verb — "Nouveau client" — the fourth thing on the line.
 *
 * The import's outcome opens a dialog rather than a toast. An import answers with numbers and
 * sometimes with a list of rows that could not be taken, and a toast that disappears after four
 * seconds is the wrong place for a list somebody has to act on.
 */
export function WorkbookMenu({
  entity,
  label,
}: {
  entity: ImportableEntity;
  /** What the lists are called here, for the menu's wording: "les clients", "les produits". */
  label: string;
}) {
  const template = useDownloadTemplate(entity);
  const exportWorkbook = useExportWorkbook(entity);
  const importWorkbook = useImportWorkbook(entity);

  const fileInput = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const busy = template.isPending || exportWorkbook.isPending || importWorkbook.isPending;

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      setResult(await importWorkbook.mutateAsync(file));
    } catch (error) {
      toast.error(message(error, "L'importation a échoué."));
    } finally {
      // Cleared so choosing the same file twice in a row still fires a change event.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" disabled={busy} aria-label="Fichier Excel" />}
        >
          {busy ? <Spinner /> : <FileSpreadsheet />}
          Excel
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem
            onClick={async () => {
              try {
                await template.mutateAsync();
              } catch (error) {
                toast.error(message(error, "Le modèle n'a pas pu être téléchargé."));
              }
            }}
          >
            <FileUp />
            Télécharger le modèle
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={async () => {
              try {
                await exportWorkbook.mutateAsync();
              } catch (error) {
                toast.error(message(error, "L'exportation a échoué."));
              }
            }}
          >
            <Download />
            Télécharger en xlsx
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => fileInput.current?.click()}>
            <Upload />
            Importer un xlsx
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={fileInput}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(event) => onFile(event.target.files?.[0])}
      />

      <Dialog open={result !== null} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Importation terminée</DialogTitle>
            <DialogDescription>{result?.message}</DialogDescription>
          </DialogHeader>

          {result && result.problems.length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border p-3">
              <p className="mb-2 text-sm font-medium text-foreground">
                Lignes non reprises
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {result.problems.map((problem, index) => (
                  <li key={index}>{problem}</li>
                ))}
              </ul>
            </div>
          )}

          {result && result.problems.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Tout le fichier a été repris. Les {label} sont à jour.
            </p>
          )}

          <DialogFooter>
            <DialogClose render={<Button />}>Fermer</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
