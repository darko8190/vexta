"use client";

import { useRef } from "react";
import { FileText, Paperclip, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useFormsQuery } from "@/hooks/use-forms";
import { useAddJobPostingDocument, useRemoveJobPostingDocument } from "@/hooks/use-job-postings";
import { MAX_UPLOAD_BYTES, useUploadMedia } from "@/hooks/use-media";
import { ApiError } from "@/lib/api";
import type { JobPosting } from "@/lib/types";

/** The option that means "no form": a Select cannot hold an empty string as a value. */
const NO_FORM = "aucun";

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/**
 * Which form an applicant fills.
 *
 * Only published forms are offered. A draft attached here would put a Postuler button on a
 * public page that leads to nothing, and the person who built the form is often not the person
 * writing the posting -- so the two screens cannot be relied on to agree.
 */
export function JobFormPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const { data: forms, isLoading } = useFormsQuery();
  const published = (forms ?? []).filter((form) => form.isPublished);

  // An already-attached form that has since been unpublished still has to be shown, or the
  // field would silently read "Aucun" while the posting still points at it.
  const attached = (forms ?? []).find((form) => form.id === value);
  const offered = attached && !attached.isPublished ? [attached, ...published] : published;

  return (
    <Field>
      <FieldLabel htmlFor="job-form">Formulaire de candidature</FieldLabel>
      <Select
        value={value ?? NO_FORM}
        onValueChange={(next) => onChange(next === NO_FORM ? null : next)}
      >
        <SelectTrigger id="job-form" className="w-full">
          <SelectValue placeholder={isLoading ? "Chargement…" : "Aucun"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_FORM}>Aucun — dire seulement où écrire</SelectItem>
          {offered.map((form) => (
            <SelectItem key={form.id} value={form.id}>
              {form.title}
              {!form.isPublished && " (brouillon)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {attached && !attached.isPublished ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>
            Ce formulaire est un brouillon. L&apos;offre n&apos;affichera pas de bouton Postuler
            tant qu&apos;il n&apos;est pas publié.
          </AlertDescription>
        </Alert>
      ) : published.length === 0 && !isLoading ? (
        <FieldDescription>
          Aucun formulaire publié. Construisez-en un dans Formulaires, puis revenez l&apos;attacher
          ici.
        </FieldDescription>
      ) : (
        <FieldDescription>
          Avec un formulaire, la page publique affiche un bouton Postuler et chaque réponse crée
          une fiche candidat.
        </FieldDescription>
      )}
    </Field>
  );
}

/**
 * The files hung on a posting: the job description as a PDF, a photograph of the site.
 *
 * Saved immediately rather than with the rest of the sheet, because a file is uploaded the
 * moment it is chosen and there is nothing to be gained by keeping it in limbo. Which is also
 * why this only appears once the posting exists: there is no row to hang a file on before that.
 */
export function JobDocumentsField({ job }: { job: JobPosting }) {
  const add = useAddJobPostingDocument();
  const remove = useRemoveJobPostingDocument();
  const upload = useUploadMedia();
  const fileInput = useRef<HTMLInputElement>(null);

  const busy = add.isPending || remove.isPending || upload.isPending;

  async function onPick(files: FileList) {
    for (const file of Array.from(files)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`${file.name} dépasse la taille permise.`);
        continue;
      }

      try {
        const asset = await upload.mutateAsync(file);
        await add.mutateAsync({ id: job.id, mediaAssetId: asset.id, label: null });
      } catch (error) {
        toast.error(
          error instanceof ApiError || error instanceof Error
            ? error.message
            : `Impossible de joindre ${file.name}.`,
        );
      }
    }
  }

  async function onRemove(documentId: string) {
    try {
      await remove.mutateAsync({ id: job.id, documentId });
      toast.success("Document retiré de l'offre.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de retirer ce document.");
    }
  }

  return (
    <Field>
      <FieldLabel>Documents et images</FieldLabel>

      {job.documents.length > 0 && (
        <ul className="grid gap-2">
          {job.documents.map((document) => (
            <li
              key={document.id}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{document.label ?? document.fileName}</p>
                <p className="text-xs text-muted-foreground">{fileSize(document.sizeBytes)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy}
                onClick={() => void onRemove(document.id)}
                aria-label={`Retirer ${document.label ?? document.fileName}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) void onPick(event.target.files);
          // Cleared so choosing the same file twice in a row still fires a change.
          event.target.value = "";
        }}
      />

      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => fileInput.current?.click()}
        className="w-fit"
      >
        {busy ? <Spinner /> : <Paperclip className="size-4" />}
        Joindre un fichier
      </Button>

      <FieldDescription>
        Visibles sur la page publique avec l&apos;offre. Douze au maximum.
      </FieldDescription>
    </Field>
  );
}
