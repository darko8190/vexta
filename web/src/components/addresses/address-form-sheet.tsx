"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { ClientSelect } from "@/components/clients/client-select";
import { useCreateAddress, useUpdateAddress, type AddressFormValues } from "@/hooks/use-addresses";
import { addressTypeLabels } from "@/lib/labels";
import type { AddressRecord, AddressType } from "@/lib/types";

const addressTypes = Object.keys(addressTypeLabels) as AddressType[];

const formSchema = z.object({
  clientId: z.string().min(1, "Le client est requis."),
  type: z.custom<AddressType>((v) => typeof v === "string" && addressTypes.includes(v as AddressType)),
  isPrimary: z.boolean(),
  line1: z.string().min(1, "L'adresse est requise."),
  line2: z.string().optional().or(z.literal("")),
  city: z.string().min(1, "La ville est requise."),
  province: z.string().optional().or(z.literal("")),
  postalCode: z.string().min(1, "Le code postal est requis."),
  country: z.string().min(1, "Le pays est requis."),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(address?: AddressRecord, defaultClientId?: string): FormValues {
  return {
    clientId: address?.clientId ?? defaultClientId ?? "",
    type: address?.type ?? "Facturation",
    isPrimary: address?.isPrimary ?? false,
    line1: address?.line1 ?? "",
    line2: address?.line2 ?? "",
    city: address?.city ?? "",
    province: address?.province ?? "",
    postalCode: address?.postalCode ?? "",
    country: address?.country ?? "Canada",
  };
}

export function AddressFormSheet({
  open,
  onOpenChange,
  address,
  defaultClientId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address?: AddressRecord;
  defaultClientId?: string;
  /** Called with the new address, so a picker that opened this sheet can select it. */
  onCreated?: (address: AddressRecord) => void;
}) {
  const isEditing = Boolean(address);
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(address, defaultClientId),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(address, defaultClientId));
  }, [open, address, defaultClientId, form]);

  async function onSubmit(values: FormValues) {
    const payload: AddressFormValues = {
      ...values,
      line2: values.line2 || undefined,
      province: values.province || undefined,
    };

    try {
      if (isEditing && address) {
        await updateAddress.mutateAsync({ id: address.id, values: payload });
        toast.success("Adresse mise à jour.");
      } else {
        onCreated?.(await createAddress.mutateAsync(payload));
        toast.success("Adresse créée.");
      }
      onOpenChange(false);
    } catch {
      toast.error("Impossible d'enregistrer l'adresse.");
    }
  }

  const pending = createAddress.isPending || updateAddress.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier l'adresse" : "Nouvelle adresse"}</SheetTitle>
          <SheetDescription>Associez une adresse à un client.</SheetDescription>
        </SheetHeader>

        <form
          id="address-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="clientId"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="address-client">Client</FieldLabel>
                  <ClientSelect id="address-client" value={field.value} onChange={field.onChange} invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="type"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="address-type">Type d&apos;adresse</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="address-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {addressTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {addressTypeLabels[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />

            <Controller
              name="line1"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="address-line1">Adresse</FieldLabel>
                  <Input {...field} id="address-line1" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="line2"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="address-line2">Complément (optionnel)</FieldLabel>
                  <Input {...field} id="address-line2" />
                </Field>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="city"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="address-city">Ville</FieldLabel>
                    <Input {...field} id="address-city" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="province"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="address-province">Province</FieldLabel>
                    <Input {...field} id="address-province" />
                  </Field>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="postalCode"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="address-postal">Code postal</FieldLabel>
                    <Input {...field} id="address-postal" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="country"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="address-country">Pays</FieldLabel>
                    <Input {...field} id="address-country" aria-invalid={fieldState.invalid} />
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
                  <Checkbox id="address-primary" checked={field.value} onCheckedChange={(v) => field.onChange(Boolean(v))} />
                  <FieldLabel htmlFor="address-primary" className="font-normal">
                    Adresse principale pour ce client
                  </FieldLabel>
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="address-form" disabled={pending}>
            {pending && <Spinner />}
            {isEditing ? "Enregistrer" : "Créer l'adresse"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
