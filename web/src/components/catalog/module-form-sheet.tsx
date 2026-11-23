"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
import { useSaveModule } from "@/hooks/use-catalog";
import { ApiError } from "@/lib/api";
import { MODULE_ICON_NAMES, moduleIcon } from "@/lib/module-icons";
import { cn } from "@/lib/utils";
import type { ModuleRecord } from "@/lib/types";
import { ex } from "@/lib/placeholders";

const formSchema = z.object({
  icon: z.string().min(1, "Choisissez une icône."),
  title: z.string().trim().min(1, "Le titre est requis.").max(60, "60 caractères maximum."),
  description: z.string().trim().min(1, "La description est requise.").max(300, "300 caractères maximum."),
  // A string, not z.coerce.number(): coercion makes the resolver's input type unknown and
  // breaks react-hook-form's typing. Parsed on submit instead.
  sortOrder: z.string().trim().regex(/^\d{1,3}$/, "Entrez un nombre entre 0 et 999."),
  isPublished: z.boolean(),
  navHref: z
    .string()
    .trim()
    .max(100, "100 caractères maximum.")
    .refine((v) => v === "" || (v.startsWith("/") && !v.startsWith("//")), "Le lien doit commencer par / et rester interne."),
  parentModuleId: z.string(),
  ownerOnly: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(module?: ModuleRecord): FormValues {
  return {
    icon: module?.icon ?? "Users",
    title: module?.title ?? "",
    description: module?.description ?? "",
    sortOrder: String(module?.sortOrder ?? 0),
    isPublished: module?.isPublished ?? true,
    navHref: module?.navHref ?? "",
    parentModuleId: module?.parentModuleId ?? NO_PARENT,
    ownerOnly: module?.ownerOnly ?? false,
  };
}

/** The select needs a value for "none"; null is not one it can hold. */
const NO_PARENT = "aucun";

export function ModuleFormSheet({
  open,
  onOpenChange,
  module,
  modules = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module?: ModuleRecord;
  /** Every module, so a parent can be chosen. */
  modules?: ModuleRecord[];
}) {
  const isEditing = Boolean(module);

  // A module cannot be its own parent, and a sub-tab cannot have sub-tabs of its own: both
  // would make a menu that renders itself for ever.
  const parents = modules.filter((m) => m.id !== module?.id && !m.parentModuleId && m.navHref);
  const save = useSaveModule();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(module),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(module));
  }, [open, module, form]);

  async function onSubmit(values: FormValues) {
    try {
      await save.mutateAsync({
        id: module?.id,
        values: {
          ...values,
          sortOrder: Number(values.sortOrder),
          navHref: values.navHref || null,
          parentModuleId: values.parentModuleId === NO_PARENT ? null : values.parentModuleId,
        },
      });
      toast.success(isEditing ? "Module mis à jour." : "Module créé.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer le module.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier le module" : "Nouveau module"}</SheetTitle>
          <SheetDescription>
            Les modules publiés composent la grille du site public et la liste incluse dans chaque forfait.
          </SheetDescription>
        </SheetHeader>

        <form
          id="module-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="icon"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Icône</FieldLabel>
                  <div
                    role="radiogroup"
                    aria-label="Icône du module"
                    className="grid grid-cols-8 gap-2"
                  >
                    {MODULE_ICON_NAMES.map((name) => {
                      const Icon = moduleIcon(name);
                      const selected = field.value === name;
                      return (
                        <button
                          key={name}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={name}
                          onClick={() => field.onChange(name)}
                          className={cn(
                            "flex size-9 items-center justify-center rounded-lg border transition-colors",
                            "focus-visible:ring-3 focus-visible:ring-ring/50 outline-none",
                            selected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <Icon className="size-4" />
                        </button>
                      );
                    })}
                  </div>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="title"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="module-title">Titre</FieldLabel>
                  <Input {...field} id="module-title" placeholder={ex("Clients")} aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="module-description">Description</FieldLabel>
                  <Textarea
                    {...field}
                    id="module-description"
                    rows={3}
                    placeholder={ex("Une fiche par client, trouvable en une recherche.")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="sortOrder"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="module-order">Ordre d&apos;affichage</FieldLabel>
                  <Input {...field} id="module-order" inputMode="numeric" />
                  <FieldDescription>Les plus petits nombres apparaissent en premier.</FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="isPublished"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id="module-published"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <FieldLabel htmlFor="module-published">Afficher sur le site public</FieldLabel>
                </Field>
              )}
            />

            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-foreground">Onglet dans l&apos;application</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Un module avec un lien devient une entrée du menu des entreprises dont le forfait
                l&apos;inclut. Dès qu&apos;un forfait en définit au moins un, son menu vient
                entièrement des modules.
              </p>
            </div>

            <Controller
              name="navHref"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="module-href">Lien</FieldLabel>
                  <Input {...field} id="module-href" placeholder={ex("/clients")} aria-invalid={fieldState.invalid} />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>Laissez vide pour un module sans écran.</FieldDescription>
                  )}
                </Field>
              )}
            />

            <Controller
              name="parentModuleId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="module-parent">Sous-onglet de</FieldLabel>
                  <Select value={field.value} onValueChange={(v) => field.onChange(v ?? NO_PARENT)}>
                    <SelectTrigger id="module-parent" className="w-full">
                      {/* Children, not a bare SelectValue: without them it renders the raw
                          value, so the "aucun" sentinel would show through as itself. */}
                      <SelectValue>
                        {parents.find((p) => p.id === field.value)?.title ?? "Aucun — onglet principal"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PARENT}>Aucun — onglet principal</SelectItem>
                      {parents.map((parent) => (
                        <SelectItem key={parent.id} value={parent.id}>
                          {parent.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>Un seul niveau : un sous-onglet n&apos;en a pas lui-même.</FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="ownerOnly"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id="module-owner-only"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <FieldLabel htmlFor="module-owner-only">
                    Réservé au propriétaire de l&apos;entreprise
                  </FieldLabel>
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="module-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {isEditing ? "Enregistrer" : "Créer le module"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
