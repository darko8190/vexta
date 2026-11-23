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
import { Textarea } from "@/components/ui/textarea";
import { AddressPicker } from "@/components/addresses/address-picker";
import { AssetTypeField } from "@/components/assets/asset-type-field";
import { useCreateClientAsset, useUpdateClientAsset } from "@/hooks/use-client-assets";
import { ApiError } from "@/lib/api";
import type { ClientAsset, SaveClientAssetValues } from "@/lib/types";
import { ex } from "@/lib/placeholders";

const formSchema = z.object({
  label: z.string().trim().min(1, "Le nom est obligatoire.").max(200, "200 caractères maximum."),
  assetTypeId: z.string(),
  make: z.string().trim().max(80, "80 caractères maximum."),
  model: z.string().trim().max(80, "80 caractères maximum."),
  year: z.string().trim(),
  serialNumber: z.string().trim().max(80, "80 caractères maximum."),
  reference: z.string().trim().max(60, "60 caractères maximum."),
  usage: z.string().trim(),
  usageUnit: z.string().trim().max(20, "20 caractères maximum."),
  addressId: z.string(),
  notes: z.string().trim().max(2000, "2000 caractères maximum."),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(asset?: ClientAsset): FormValues {
  return {
    label: asset?.label ?? "",
    assetTypeId: asset?.assetTypeId ?? "",
    make: asset?.make ?? "",
    model: asset?.model ?? "",
    year: asset?.year != null ? String(asset.year) : "",
    serialNumber: asset?.serialNumber ?? "",
    reference: asset?.reference ?? "",
    usage: asset?.usage != null ? String(asset.usage) : "",
    // Kilometres is what most shops count, and it is one keystroke to change.
    usageUnit: asset?.usageUnit ?? "",
    addressId: asset?.addressId ?? "",
    notes: asset?.notes ?? "",
    isActive: asset?.isActive ?? true,
  };
}

/**
 * One of a client's assets.
 *
 * The placeholders are a garage's, because that is the trade that asked for this and a blank
 * field teaches nobody what goes in it. The labels are not: "Numéro de série" covers a VIN and
 * a compressor's plate, and a field called NIV would be wrong for everyone but the garage.
 */
export function AssetFormSheet({
  open,
  onOpenChange,
  clientId,
  asset,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  asset?: ClientAsset;
  /**
   * Handed the asset that was just created, so a picker that opened this sheet can select it.
   * Not called on an edit: nothing was added to choose.
   */
  onCreated?: (asset: ClientAsset) => void;
}) {
  const isEditing = Boolean(asset);
  const create = useCreateClientAsset(clientId);
  const update = useUpdateClientAsset(clientId);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(asset),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(asset));
  }, [open, asset, form]);

  const pending = create.isPending || update.isPending;

  async function onSubmit(values: FormValues) {
    const payload: SaveClientAssetValues = {
      label: values.label,
      assetTypeId: values.assetTypeId || null,
      make: values.make || null,
      model: values.model || null,
      year: values.year ? Number(values.year) : null,
      serialNumber: values.serialNumber || null,
      reference: values.reference || null,
      usage: values.usage ? Number(values.usage) : null,
      usageUnit: values.usageUnit || null,
      addressId: values.addressId || null,
      notes: values.notes || null,
      isActive: values.isActive,
    };

    try {
      if (asset) {
        await update.mutateAsync({ id: asset.id, values: payload });
        toast.success("Actif enregistré.");
      } else {
        const created = await create.mutateAsync(payload);
        toast.success("Actif ajouté.");
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer cet actif.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier l'actif" : "Nouvel actif"}</SheetTitle>
          <SheetDescription>
            Ce sur quoi vous travaillez chez ce client : un véhicule, un bâtiment, un appareil.
          </SheetDescription>
        </SheetHeader>

        <form
          id="asset-form"
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
                  <FieldLabel htmlFor="asset-label">
                    Nom
                    <RequiredMark />
                  </FieldLabel>
                  <Input
                    {...field}
                    id="asset-label"
                    placeholder={ex("Corolla bleue de Monsieur Roy")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>Comme vous l&apos;appelez au comptoir.</FieldDescription>
                  )}
                </Field>
              )}
            />

            <Controller
              name="assetTypeId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="asset-type">Type</FieldLabel>
                  <AssetTypeField id="asset-type" value={field.value} onChange={field.onChange} />
                  <FieldDescription>
                    Véhicule, maison, bloc appartements, machinerie — votre liste, que vous
                    complétez au fur et à mesure.
                  </FieldDescription>
                </Field>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="make"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="asset-make">Marque</FieldLabel>
                    <Input {...field} id="asset-make" placeholder={ex("Toyota")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="model"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="asset-model">Modèle</FieldLabel>
                    <Input {...field} id="asset-model" placeholder={ex("Corolla")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            <Controller
              name="year"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="asset-year">Année</FieldLabel>
                  <Input
                    {...field}
                    id="asset-year"
                    type="number"
                    min="1900"
                    placeholder={ex("2018")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="serialNumber"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="asset-serial">Numéro de série</FieldLabel>
                  <Input
                    {...field}
                    id="asset-serial"
                    placeholder={ex("NIV, numéro de série")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="reference"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="asset-reference">Référence</FieldLabel>
                  <Input
                    {...field}
                    id="asset-reference"
                    placeholder={ex("Plaque, numéro d'unité")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>
                      L&apos;autre numéro par lequel vous le cherchez.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="usage"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="asset-usage">Usage</FieldLabel>
                    <Input
                      {...field}
                      id="asset-usage"
                      type="number"
                      step="1"
                      min="0"
                      placeholder={ex("142000")}
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="usageUnit"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="asset-usage-unit">Unité</FieldLabel>
                    <Input {...field} id="asset-usage-unit" placeholder={ex("km")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            <Controller
              name="addressId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="asset-address">Adresse</FieldLabel>
                  <AddressPicker
                    id="asset-address"
                    clientId={clientId}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Où il se trouve…"
                  />
                  <FieldDescription>Pour ce qui ne se déplace pas.</FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="notes"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="asset-notes">Notes</FieldLabel>
                  <Textarea {...field} id="asset-notes" rows={3} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="isActive"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id="asset-active"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <FieldLabel htmlFor="asset-active" className="font-normal">
                    Toujours en service
                  </FieldLabel>
                </Field>
              )}
            />
            <FieldDescription>
              Décochez-le quand il est vendu ou mis au rebut : il sort de la liste sans effacer le
              travail déjà fait dessus.
            </FieldDescription>
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="asset-form" disabled={pending}>
            {pending && <Spinner />}
            {isEditing ? "Enregistrer" : "Ajouter l'actif"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
