"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { MapPin, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { useDeleteLocation, useLocationsQuery, useSaveLocation } from "@/hooks/use-hr";
import { CountrySelect, SubdivisionField } from "@/components/addresses/country-field";
import { ApiError } from "@/lib/api";
import { defaultCountryName, isKnownSubdivision, subdivisionLabel } from "@/lib/geo";
import type { CompanyLocation } from "@/lib/types";
import { ex } from "@/lib/placeholders";
import { rowOpenClassName, rowOpenProps } from "@/components/layout/row-open";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  label: z.string().trim().min(1, "Le nom du lieu est requis.").max(100, "100 caractères maximum."),
  line1: z.string().trim().min(1, "L'adresse est requise.").max(200, "200 caractères maximum."),
  line2: z.string().trim().max(100, "100 caractères maximum."),
  city: z.string().trim().min(1, "La ville est requise.").max(120, "120 caractères maximum."),
  province: z.string().trim().max(80, "80 caractères maximum."),
  postalCode: z.string().trim().min(1, "Le code postal est requis.").max(20, "20 caractères maximum."),
  country: z.string().trim().max(80, "80 caractères maximum."),
  phone: z.string().trim().max(40, "40 caractères maximum."),
  isPrimary: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(location?: CompanyLocation): FormValues {
  return {
    label: location?.label ?? "",
    line1: location?.line1 ?? "",
    line2: location?.line2 ?? "",
    city: location?.city ?? "",
    province: location?.province ?? "Québec",
    postalCode: location?.postalCode ?? "",
    country: location?.country ?? defaultCountryName,
    phone: location?.phone ?? "",
    isPrimary: location?.isPrimary ?? false,
  };
}

function LocationFormSheet({
  open,
  onOpenChange,
  location,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location?: CompanyLocation;
}) {
  const isEditing = Boolean(location);
  const save = useSaveLocation();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(location),
  });

  // Watched rather than read once: the province field is a list for some countries and a
  // plain box for the others, and it has to change the moment the country does.
  const country = useWatch({ control: form.control, name: "country" });

  useEffect(() => {
    if (open) form.reset(toFormValues(location));
  }, [open, location, form]);

  async function onSubmit(values: FormValues) {
    try {
      await save.mutateAsync({
        id: location?.id,
        values: {
          label: values.label,
          isPrimary: values.isPrimary,
          line1: values.line1,
          line2: values.line2 || null,
          city: values.city,
          province: values.province || null,
          postalCode: values.postalCode,
          country: values.country || defaultCountryName,
          phone: values.phone || null,
        },
      });
      toast.success(isEditing ? "Lieu mis à jour." : "Lieu ajouté.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer ce lieu.");
    }
  }

  // The only primary cannot be unticked: a company with no main address shows none on its
  // profile and on its documents.
  const lockedPrimary = isEditing && Boolean(location?.isPrimary);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier le lieu" : "Nouveau lieu"}</SheetTitle>
          <SheetDescription>
            Un endroit qu&apos;occupe l&apos;entreprise : siège social, entrepôt, cour à matériaux.
          </SheetDescription>
        </SheetHeader>

        <form
          id="location-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="label"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="location-label">Nom du lieu</FieldLabel>
                  <Input {...field} id="location-label" placeholder={ex("Siège social")} aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="line1"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="location-line1">Adresse</FieldLabel>
                  <Input {...field} id="location-line1" placeholder={ex("1200 rue Principale")} aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <Controller
                name="city"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="location-city">Ville</FieldLabel>
                    <Input {...field} id="location-city" placeholder={ex("Québec")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="line2"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="location-line2">Suite</FieldLabel>
                    <Input {...field} id="location-line2" placeholder={ex("200")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="postalCode"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="location-postal">Code postal</FieldLabel>
                    <Input {...field} id="location-postal" placeholder={ex("G1R 2B5")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="country"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="location-country">Pays</FieldLabel>
                    <CountrySelect
                      id="location-country"
                      value={field.value}
                      onChange={(next) => {
                        field.onChange(next);
                        // A province the new country does not have cannot stay behind on the
                        // record: it would print an address that reads as a mistake.
                        if (!isKnownSubdivision(next, form.getValues("province"))) {
                          form.setValue("province", "");
                        }
                      }}
                      invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="province"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="location-province">{subdivisionLabel(country)}</FieldLabel>
                    <SubdivisionField
                      id="location-province"
                      value={field.value}
                      onChange={field.onChange}
                      countryName={country}
                      invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="phone"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="location-phone">Téléphone</FieldLabel>
                    <Input {...field} id="location-phone" type="tel" placeholder={ex("418 555-0100")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            <Controller
              name="isPrimary"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id="location-primary"
                    checked={field.value}
                    disabled={lockedPrimary}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <FieldLabel htmlFor="location-primary">Adresse principale de l&apos;entreprise</FieldLabel>
                </Field>
              )}
            />
            <FieldDescription>
              {lockedPrimary
                ? "C'est déjà l'adresse principale. Pour la changer, cochez cette case sur un autre lieu."
                : "C'est celle qui apparaît sur la fiche de l'entreprise et sur ses documents."}
            </FieldDescription>
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="location-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {isEditing ? "Enregistrer" : "Ajouter le lieu"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function LocationsSection() {
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } = useLocationsQuery();
  const remove = useDeleteLocation();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyLocation | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<CompanyLocation | undefined>(undefined);

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Lieu supprimé.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer ce lieu.");
    }
  }

  const createButton = (
    <Button onClick={openCreate}>
      <Plus />
      Nouveau lieu
    </Button>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Adresses</h2>
          <p className="text-sm text-muted-foreground">
            Les lieux de l&apos;entreprise. Celle marquée principale apparaît sur votre fiche.
          </p>
        </div>
        {createButton}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        /* An error is not an empty list. "Aucun lieu" after a failed request tells someone
           their addresses are gone, when they were simply not read.
           And `isError` alone is too wide: a failed background refetch keeps it true over rows
           that are still right, so the panel only wins with nothing read at all (`!data`) or rows
           left over from another query key (`isPlaceholderData`). */
        <LoadErrorState
          error={loadError}
          title="Adresses indisponibles"
          fallback="Vos adresses n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Aucun lieu"
          description="Ajoutez au moins le siège social : c'est l'adresse qui apparaîtra sur vos documents."
          action={createButton}
        />
      ) : (
        <ul className="space-y-2">
          {data.map((location) => (
            <li key={location.id} {...rowOpenProps(() => { setEditing(location); setFormOpen(true); }, "Ouvrir la fiche")} className={cn("flex items-start gap-3 rounded-lg border border-border bg-card p-3", rowOpenClassName)}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{location.label}</span>
                  {location.isPrimary && <Badge variant="default">Principale</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[location.line1, location.line2, location.city, location.province, location.postalCode, location.country]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                {location.phone && (
                  <a href={`tel:${location.phone}`} className="mt-1 inline-block text-sm text-muted-foreground hover:text-foreground">
                    {location.phone}
                  </a>
                )}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions pour ${location.label}`} />}>
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(location);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil />
                    Modifier
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(location)}>
                    <Trash2 />
                    Supprimer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <LocationFormSheet open={formOpen} onOpenChange={setFormOpen} location={editing} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer ce lieu ?"
        description={
          deleteTarget?.isPrimary
            ? `« ${deleteTarget.label} » est l'adresse principale. Un autre lieu prendra sa place automatiquement.`
            : `« ${deleteTarget?.label} » sera supprimé.`
        }
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
