"use client";

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useSaveProjectDocument } from "@/hooks/use-project-files";
import { MAX_UPLOAD_BYTES, useUploadMedia } from "@/hooks/use-media";
import { ApiError } from "@/lib/api";
import type { ProjectDocument } from "@/lib/types";
import { formatFileSize } from "@/components/projects/detail/document-file-size";

const formSchema = z.object({
  title: z.string().trim().min(1, "Le titre est requis.").max(200, "200 caractères maximum."),
  category: z.string().trim().max(100, "100 caractères maximum."),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Filing a file against the job, or renaming one already filed.
 *
 * The file itself cannot be swapped on an existing document: the title is what people refer to
 * it by, and quietly replacing the bytes behind it would turn the plan somebody opened
 * yesterday into another one. A new version is a new document.
 */
export function DocumentFormSheet({
  open,
  onOpenChange,
  projectId,
  document,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  document?: ProjectDocument;
}) {
  const isEditing = Boolean(document);
  const upload = useUploadMedia();
  const save = useSaveProjectDocument(projectId);

  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", category: "" },
  });

  useEffect(() => {
    if (!open) return;

    form.reset({ title: document?.title ?? "", category: document?.category ?? "" });
  }, [open, document, form]);

  async function onSubmit(values: FormValues) {
    if (!isEditing && !file) {
      toast.error("Choisissez un fichier.");
      return;
    }

    try {
      // Two steps on purpose: the bytes go to R2 first, and only a stored file earns a row on
      // the project. The reverse order would leave documents pointing at nothing.
      const mediaAssetId = file ? (await upload.mutateAsync(file)).id : document!.mediaAssetId;

      await save.mutateAsync({
        id: document?.id,
        values: {
          title: values.title.trim(),
          category: values.category.trim() || null,
          mediaAssetId,
        },
      });

      toast.success(isEditing ? "Document mis à jour." : "Document ajouté.");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Impossible d'enregistrer ce document.",
      );
    }
  }

  const pending = upload.isPending || save.isPending;

  return (
    <Sheet
      open={open}
      // Cleared as the panel closes rather than as it opens: the same reset, but in an event
      // handler, where it cannot cascade a render.
      onOpenChange={(next) => {
        if (!next) setFile(null);
        onOpenChange(next);
      }}
    >
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier le document" : "Nouveau document"}</SheetTitle>
          <SheetDescription>
            Un plan, un permis, une soumission signée, les photos de fin de travaux. Le fichier
            est aussi rangé dans votre bibliothèque.
          </SheetDescription>
        </SheetHeader>

        <form
          id="project-document-form"
          className="flex-1 overflow-y-auto px-4"
          // Stops here rather than bubbling: this panel is opened from a page that may itself
          // sit inside a form, and React routes a submit up its own tree regardless of where
          // the portal puts the markup.
          onSubmit={(event) => {
            event.stopPropagation();
            return form.handleSubmit(onSubmit)(event);
          }}
          noValidate
        >
          <FieldGroup>
            {!isEditing && (
              <Field>
                <FieldLabel htmlFor="project-document-file">
                  Fichier
                  <RequiredMark />
                </FieldLabel>
                <input
                  ref={fileInput}
                  id="project-document-file"
                  type="file"
                  className="sr-only"
                  onChange={(event) => {
                    const chosen = event.target.files?.[0] ?? null;
                    if (chosen && chosen.size > MAX_UPLOAD_BYTES) {
                      toast.error(`${chosen.name} dépasse la taille permise.`);
                      event.target.value = "";
                      return;
                    }

                    setFile(chosen);
                    // Saves typing the obvious: the file name is almost always the title.
                    if (chosen && !form.getValues("title")) {
                      form.setValue("title", chosen.name.replace(/\.[^.]+$/, ""), {
                        shouldValidate: true,
                      });
                    }
                    event.target.value = "";
                  }}
                />
                <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                  <Upload />
                  {file ? "Changer de fichier" : "Choisir un fichier"}
                </Button>
                <FieldDescription>
                  {file ? `${file.name} — ${formatFileSize(file.size)}` : "Aucun fichier choisi."}
                </FieldDescription>
              </Field>
            )}

            <Controller
              name="title"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="project-document-title">
                    Titre
                    <RequiredMark />
                  </FieldLabel>
                  <Input
                    {...field}
                    id="project-document-title"
                    placeholder="Plan de la terrasse"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>
                      Ce qu&apos;on cherche dans la liste. Le nom du fichier se lit rarement.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />

            <Controller
              name="category"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="project-document-category">Catégorie</FieldLabel>
                  <Input
                    {...field}
                    id="project-document-category"
                    placeholder="Permis"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>Facultatif. Votre propre classement.</FieldDescription>
                  )}
                </Field>
              )}
            />

            {isEditing && (
              <FieldDescription>
                Le fichier reste le même : {document?.fileName}. Pour une nouvelle version,
                ajoutez un document.
              </FieldDescription>
            )}
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="project-document-form" disabled={pending}>
            {pending && <Spinner />}
            {isEditing ? "Enregistrer" : "Ajouter le document"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
