"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { ImagePlus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateExpenseType,
  useExpenseQuery,
  useExpenseTypesQuery,
  useSaveExpense,
} from "@/hooks/use-expenses";
import { useUploadMedia, MAX_UPLOAD_BYTES } from "@/hooks/use-media";
import { ApiError } from "@/lib/api";
import type { ProjectExpense } from "@/lib/types";

const formSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis.").max(200, "200 caractères maximum."),
  description: z.string().trim().max(2000, "2000 caractères maximum."),
  expenseTypeId: z.string().min(1, "Le type est requis."),
  cost: z.string(),
  sellingPrice: z.string(),
  spentOn: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

/** A photograph already attached, or one just uploaded and not yet saved. */
interface Attachment {
  mediaAssetId: string;
  fileName: string;
  /** Signed and short-lived for a saved photo; a local blob for one just picked. */
  previewUrl: string | null;
}

/** "49,99" and "49.99" both, because a price is typed with a comma here. */
function parseAmount(value: string): number | null | "invalid" {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+([.]\d{1,2})?$/.test(normalized)) return "invalid";

  return Number(normalized);
}

function amountField(value: number | null | undefined): string {
  if (value == null) return "";
  return value % 1 === 0 ? String(value) : value.toFixed(2).replace(".", ",");
}

export function ExpenseFormSheet({
  open,
  onOpenChange,
  projectId,
  expense,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  expense?: ProjectExpense;
}) {
  const isEditing = Boolean(expense);
  const save = useSaveExpense(projectId);
  const upload = useUploadMedia();
  const { data: types, isLoading: typesLoading } = useExpenseTypesQuery();
  const createType = useCreateExpenseType();

  // Only when editing: a new expense has no photographs to fetch, and the signed links the
  // detail endpoint returns expire, so they are asked for when the panel opens.
  const { data: detail } = useExpenseQuery(projectId, open && expense ? expense.id : undefined);

  // Null until something is added or removed, and then it is the whole list. Derived from what
  // the server returned until that point, which is what keeps the photographs out of an effect:
  // nothing has to be copied into state just to be shown.
  const [edited, setEdited] = useState<Attachment[] | null>(null);
  const [addingType, setAddingType] = useState(false);
  const [newType, setNewType] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      expenseTypeId: "",
      cost: "",
      sellingPrice: "",
      spentOn: "",
    },
  });

  useEffect(() => {
    if (!open) return;

    form.reset({
      name: expense?.name ?? "",
      description: expense?.description ?? "",
      expenseTypeId: expense?.expenseTypeId ?? "",
      cost: amountField(expense?.cost),
      sellingPrice: amountField(expense?.sellingPrice),
      spentOn: expense?.spentOn ?? "",
    });

  }, [open, expense, form]);

  const saved: Attachment[] = useMemo(
    () =>
      expense && detail
        ? detail.photos.map((photo) => ({
            mediaAssetId: photo.mediaAssetId,
            fileName: photo.fileName,
            previewUrl: photo.url,
          }))
        : [],
    [expense, detail],
  );

  const attachments = edited ?? saved;

  // Editing an expense whose photographs have not arrived yet: adding one now would save a list
  // that is missing the ones already on file, so the control waits the moment it takes.
  const photosLoading = Boolean(expense) && detail === undefined;

  async function onPick(files: FileList) {
    for (const file of Array.from(files)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`${file.name} dépasse la taille permise.`);
        continue;
      }

      try {
        const asset = await upload.mutateAsync(file);
        setEdited((current) => [
          ...(current ?? saved),
          {
            mediaAssetId: asset.id,
            fileName: asset.fileName,
            // The local file, so the thumbnail appears without waiting on a signed link.
            previewUrl: URL.createObjectURL(file),
          },
        ]);
      } catch (error) {
        toast.error(
          error instanceof ApiError || error instanceof Error
            ? error.message
            : `Impossible de téléverser ${file.name}.`,
        );
      }
    }
  }

  async function onAddType() {
    const name = newType.trim();
    if (!name) return;

    try {
      const created = await createType.mutateAsync(name);
      form.setValue("expenseTypeId", created.id, { shouldValidate: true });
      setNewType("");
      setAddingType(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de créer ce type.");
    }
  }

  async function onSubmit(values: FormValues) {
    const cost = parseAmount(values.cost);
    const sellingPrice = parseAmount(values.sellingPrice);

    if (cost === "invalid" || sellingPrice === "invalid") {
      toast.error("Un montant doit s'écrire comme 1250 ou 1250,99.");
      return;
    }

    try {
      await save.mutateAsync({
        id: expense?.id,
        values: {
          name: values.name,
          description: values.description || null,
          expenseTypeId: values.expenseTypeId,
          cost,
          sellingPrice,
          spentOn: values.spentOn || null,
          mediaAssetIds: attachments.map((photo) => photo.mediaAssetId),
        },
      });

      toast.success(isEditing ? "Dépense mise à jour." : "Dépense ajoutée.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer la dépense.");
    }
  }

  const pending = save.isPending;

  return (
    <Sheet
      open={open}
      // Cleared as the panel closes rather than as it opens: the same reset, but in an event
      // handler, where it cannot cascade a render.
      onOpenChange={(next) => {
        if (!next) {
          setEdited(null);
          setAddingType(false);
          setNewType("");
        }
        onOpenChange(next);
      }}
    >
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier la dépense" : "Nouvelle dépense"}</SheetTitle>
          <SheetDescription>
            Ce qui a été payé sur le chantier, avec la preuve en photo.
          </SheetDescription>
        </SheetHeader>

        <form
          id="expense-form"
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
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="expense-name">
                    Nom
                    <RequiredMark />
                  </FieldLabel>
                  <Input
                    {...field}
                    id="expense-name"
                    placeholder="Permis de construction"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="expenseTypeId"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="expense-type">
                    Type
                    <RequiredMark />
                  </FieldLabel>
                  <div className="flex gap-2">
                    <Select
                      // null, not undefined: Base UI reads undefined as an uncontrolled select
                      // and warns when a value later makes it controlled.
                      value={field.value || null}
                      onValueChange={(value) => field.onChange(value ?? "")}
                    >
                      <SelectTrigger id="expense-type" className="w-full" aria-invalid={fieldState.invalid}>
                        {/* The stored value is a GUID, so the name is looked up rather than
                            shown as itself. The empty case is handled here too: these children
                            are rendered even when nothing is selected, which means the
                            placeholder prop never gets a turn. */}
                        <SelectValue>
                          {(id: string) =>
                            !id
                              ? typesLoading
                                ? "Chargement…"
                                : "Choisir un type"
                              : (types?.find((type) => type.id === id)?.name ?? "Chargement…")
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(types ?? []).map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            {type.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      aria-label="Ajouter un type"
                      onClick={() => setAddingType((current) => !current)}
                    >
                      <Plus />
                    </Button>
                  </div>

                  {addingType && (
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={newType}
                        onChange={(event) => setNewType(event.target.value)}
                        placeholder="Hébergement"
                        aria-label="Nom du nouveau type"
                        onKeyDown={(event) => {
                          // Enter adds the type instead of submitting the expense, which would
                          // save it without the type that is being created for it.
                          if (event.key === "Enter") {
                            event.preventDefault();
                            onAddType();
                          }
                        }}
                      />
                      <Button type="button" onClick={onAddType} disabled={createType.isPending || !newType.trim()}>
                        {createType.isPending && <Spinner />}
                        Ajouter
                      </Button>
                    </div>
                  )}

                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>
                      Votre liste. Ajoutez-en un avec le bouton quand il en manque.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />

            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="expense-description">Description</FieldLabel>
                  <Textarea {...field} id="expense-description" rows={3} aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="cost"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="expense-cost">Coût</FieldLabel>
                    <Input {...field} id="expense-cost" inputMode="decimal" placeholder="0,00" />
                    <FieldDescription>Ce que vous avez payé.</FieldDescription>
                  </Field>
                )}
              />
              <Controller
                name="sellingPrice"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="expense-selling">Vendant</FieldLabel>
                    <Input {...field} id="expense-selling" inputMode="decimal" placeholder="0,00" />
                    <FieldDescription>Ce que le client paie.</FieldDescription>
                  </Field>
                )}
              />
            </div>

            <Controller
              name="spentOn"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="expense-date">Date</FieldLabel>
                  <Input {...field} id="expense-date" type="date" />
                </Field>
              )}
            />

            <Field>
              <FieldLabel htmlFor="expense-photos">Photos</FieldLabel>
              <input
                ref={fileInput}
                id="expense-photos"
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="sr-only"
                onChange={(event) => {
                  const files = event.target.files;
                  if (files && files.length > 0) onPick(files);
                  event.target.value = "";
                }}
              />

              {attachments.length > 0 && (
                <ul className="mb-2 grid grid-cols-3 gap-2">
                  {attachments.map((photo) => (
                    <li
                      key={photo.mediaAssetId}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted/40"
                    >
                      {photo.previewUrl ? (
                        /* Not next/image: these are signed, short-lived URLs on another origin,
                           and the optimizer would cache a link that has already expired. */
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo.previewUrl} alt={photo.fileName} className="size-full object-cover" />
                      ) : (
                        <span className="flex size-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
                          {photo.fileName}
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label={`Retirer ${photo.fileName}`}
                        onClick={() =>
                          setEdited((current) =>
                            (current ?? saved).filter(
                              (item) => item.mediaAssetId !== photo.mediaAssetId,
                            ),
                          )
                        }
                        className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-foreground shadow-sm transition-opacity hover:bg-background"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <Button
                type="button"
                variant="outline"
                disabled={upload.isPending || photosLoading}
                onClick={() => fileInput.current?.click()}
              >
                {upload.isPending || photosLoading ? <Spinner /> : <ImagePlus />}
                Ajouter des photos
              </Button>
              <FieldDescription>
                La photo du reçu, prise sur place. Elle reste aussi dans votre bibliothèque.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="expense-form" disabled={pending}>
            {pending && <Spinner />}
            {isEditing ? "Enregistrer" : "Ajouter la dépense"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
