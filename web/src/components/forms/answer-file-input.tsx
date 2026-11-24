"use client";

import { useRef } from "react";
import { Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { MAX_UPLOAD_BYTES, useUploadMedia } from "@/hooks/use-media";
import { ApiError } from "@/lib/api";

/**
 * The control behind a Fichier question.
 *
 * The file is uploaded the moment it is chosen, through the same media routes as every other
 * file in the application, and the form is then given its id. Uploading on submit instead would
 * mean a form that fails late, after the person has already left the sheet in their head -- and
 * it would put the size limit and the quota in a second place.
 */
export function AnswerFileInput({
  id,
  fileName,
  onFile,
  invalid,
}: {
  id: string;
  fileName: string;
  onFile: (asset: { id: string; fileName: string } | null) => void;
  invalid?: boolean;
}) {
  const upload = useUploadMedia();
  const input = useRef<HTMLInputElement>(null);

  async function onPick(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`${file.name} dépasse la taille permise.`);
      return;
    }

    try {
      const asset = await upload.mutateAsync(file);
      onFile({ id: asset.id, fileName: asset.fileName });
    } catch (error) {
      toast.error(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : `Impossible de téléverser ${file.name}.`,
      );
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={input}
        id={id}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onPick(file);
          // Cleared so choosing the same file twice in a row still fires a change.
          event.target.value = "";
        }}
      />

      {fileName ? (
        <>
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{fileName}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onFile(null)}
            aria-label={`Retirer ${fileName}`}
          >
            <X className="size-4" />
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          aria-invalid={invalid}
          disabled={upload.isPending}
          onClick={() => input.current?.click()}
        >
          {upload.isPending ? <Spinner /> : <Paperclip className="size-4" />}
          Choisir un fichier
        </Button>
      )}
    </div>
  );
}
