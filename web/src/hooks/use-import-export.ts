import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";

/** The four lists a workbook can carry. The slug is what the route takes. */
export type ImportableEntity = "clients" | "employes" | "fournisseurs" | "produits";

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  /** One line per row that could not be taken, saying which row and why. */
  problems: string[];
  message: string;
}

/**
 * Downloads a workbook and hands it to the browser.
 *
 * Not through the JSON client: that one parses every answer, and an .xlsx is bytes. The proxy
 * already passes anything non-textual through untouched, so the only work here is turning the
 * response into a file the browser will save.
 */
async function download(path: string) {
  const response = await fetch(`/api/proxy/${path}`);

  if (!response.ok) {
    const text = await response.text();
    let message = `Le téléchargement a échoué (code ${response.status}).`;
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? message;
    } catch {
      // Not JSON — the status is all there is to say.
    }
    throw new ApiError(message, response.status);
  }

  const blob = await response.blob();

  // The name the API chose, which carries today's date for an export. Falling back rather than
  // failing: a proxy that drops the header should cost a good filename, not the download.
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const fileName = match ? decodeURIComponent(match[1]) : "vexta.xlsx";

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function useDownloadTemplate(entity: ImportableEntity) {
  return useMutation({ mutationFn: () => download(`import-export/${entity}/modele`) });
}

export function useExportWorkbook(entity: ImportableEntity) {
  return useMutation({ mutationFn: () => download(`import-export/${entity}/export`) });
}

export function useImportWorkbook(entity: ImportableEntity) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File): Promise<ImportResult> => {
      const form = new FormData();
      form.append("fichier", file);

      // No Content-Type header on purpose: the browser sets it, with the boundary, and a header
      // written by hand here would lose that boundary and make the body unparseable.
      const response = await fetch(`/api/proxy/import-export/${entity}/import`, {
        method: "POST",
        body: form,
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : null;

      if (!response.ok) {
        throw new ApiError(
          data?.message ?? `L'importation a échoué (code ${response.status}).`,
          response.status,
        );
      }

      return data as ImportResult;
    },
    // An import touches a list, its sub-lists and every count drawn from them.
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
