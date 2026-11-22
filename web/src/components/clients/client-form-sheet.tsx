"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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
import { useCreateClient, useUpdateClient } from "@/hooks/use-clients";
import { ApiError } from "@/lib/api";
import { formatClientNumber, type ClientRecord } from "@/lib/types";

const PROVINCES = [
  "Québec",
  "Ontario",
  "Nouveau-Brunswick",
  "Nouvelle-Écosse",
  "Île-du-Prince-Édouard",
  "Terre-Neuve-et-Labrador",
  "Manitoba",
  "Saskatchewan",
  "Alberta",
  "Colombie-Britannique",
  "Yukon",
  "Territoires du Nord-Ouest",
  "Nunavut",
];

const formSchema = z
  .object({
    type: z.enum(["Particulier", "Entreprise"]),
    companyName: z.string().trim().max(200, "200 caractères maximum."),
    firstName: z.string().trim().max(100, "100 caractères maximum."),
    lastName: z.string().trim().max(100, "100 caractères maximum."),
    phone: z.string().trim().max(40, "40 caractères maximum."),
    email: z.string().trim().max(256).refine((v) => v === "" || z.string().email().safeParse(v).success, "Courriel invalide."),
    line1: z.string().trim().max(200, "200 caractères maximum."),
    apartment: z.string().trim().max(40, "40 caractères maximum."),
    city: z.string().trim().max(120, "120 caractères maximum."),
    postalCode: z.string().trim().max(20, "20 caractères maximum."),
    province: z.string().trim(),
    country: z.string().trim().max(80, "80 caractères maximum."),
    isTaxExempt: z.boolean(),
  })
  // A company has to be named; a person does not.
  .refine((v) => v.type !== "Entreprise" || v.companyName.length > 0, {
    message: "Le nom d'entreprise est requis.",
    path: ["companyName"],
  })
  // For a particulier these fields are the name, so they are required. For an entreprise they
  // are whoever you call there, which you may not know yet.
  .refine((v) => v.type !== "Particulier" || v.firstName.length > 0, {
    message: "Le prénom est requis.",
    path: ["firstName"],
  })
  .refine((v) => v.type !== "Particulier" || v.lastName.length > 0, {
    message: "Le nom est requis.",
    path: ["lastName"],
  })
  // An address is optional, but a half-filled one would print wrong on an invoice.
  .refine((v) => v.line1 === "" || v.city.length > 0, {
    message: "La ville est requise avec une adresse.",
    path: ["city"],
  })
  .refine((v) => v.line1 === "" || v.postalCode.length > 0, {
    message: "Le code postal est requis avec une adresse.",
    path: ["postalCode"],
  });

type FormValues = z.infer<typeof formSchema>;

function toFormValues(client?: ClientRecord): FormValues {
  return {
    type: client?.type ?? "Entreprise",
    companyName: client?.companyName ?? "",
    firstName: client?.firstName ?? "",
    lastName: client?.lastName ?? "",
    phone: client?.phone ?? "",
    email: client?.email ?? "",
    line1: client?.primaryAddress?.line1 ?? "",
    apartment: client?.primaryAddress?.apartment ?? "",
    city: client?.primaryAddress?.city ?? "",
    postalCode: client?.primaryAddress?.postalCode ?? "",
    province: client?.primaryAddress?.province ?? "Québec",
    country: client?.primaryAddress?.country ?? "Canada",
    isTaxExempt: client?.isTaxExempt ?? false,
  };
}

export function ClientFormSheet({
  open,
  onOpenChange,
  client,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: ClientRecord;
  /** Called with the new client, so a picker that opened this sheet can select it. */
  onCreated?: (client: ClientRecord) => void;
}) {
  const isEditing = Boolean(client);
  const create = useCreateClient();
  const update = useUpdateClient();
  const pending = create.isPending || update.isPending;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(client),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(client));
  }, [open, client, form]);

  const type = useWatch({ control: form.control, name: "type" });

  async function onSubmit(values: FormValues) {
    const payload = {
      type: values.type,
      companyName: values.type === "Entreprise" ? values.companyName : null,
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email || null,
      phone: values.phone || null,
      isTaxExempt: values.isTaxExempt,
      primaryAddress: values.line1
        ? {
            line1: values.line1,
            apartment: values.apartment || null,
            city: values.city,
            province: values.province || null,
            postalCode: values.postalCode,
            country: values.country || "Canada",
          }
        : null,
    };

    try {
      if (client) {
        await update.mutateAsync({ id: client.id, values: payload });
      } else {
        onCreated?.(await create.mutateAsync(payload));
      }
      toast.success(isEditing ? "Client mis à jour." : "Client créé.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer ce client.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier le client" : "Nouveau client"}</SheetTitle>
          <SheetDescription>
            {isEditing && client
              ? `Numéro ${formatClientNumber(client.number)} — attribué automatiquement et jamais réutilisé.`
              : "Le numéro est attribué automatiquement à la création."}
          </SheetDescription>
        </SheetHeader>

        <form
          id="client-form"
          className="flex-1 overflow-y-auto px-4"
          // Stops here rather than bubbling. This sheet is opened from inside another form —
          // the project form, through the picker — and although the portal puts it elsewhere in
          // the page, React still routes the submit up its own tree to that outer form. The
          // outer form then saved and closed on a press meant for this one.
          onSubmit={(event) => {
            event.stopPropagation();
            return form.handleSubmit(onSubmit)(event);
          }}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="type"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="client-type">Type</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="client-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Particulier">Particulier</SelectItem>
                      <SelectItem value="Entreprise">Entreprise</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />

            {type === "Entreprise" && (
              <Controller
                name="companyName"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="client-company">Nom d&apos;entreprise</FieldLabel>
                    <Input {...field} id="client-company" placeholder="Constructions ABC" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="firstName"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="client-firstname">Prénom</FieldLabel>
                    <Input {...field} id="client-firstname" placeholder="Marie" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="lastName"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="client-lastname">Nom</FieldLabel>
                    <Input {...field} id="client-lastname" placeholder="Roy" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>
            {type === "Entreprise" && (
              <FieldDescription>
                La personne à joindre chez ce client. Facultative — d&apos;autres contacts
                s&apos;ajoutent depuis sa fiche.
              </FieldDescription>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="phone"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="client-phone">Téléphone</FieldLabel>
                    <Input {...field} id="client-phone" type="tel" placeholder="514 555-0199" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="client-email">Courriel</FieldLabel>
                    <Input {...field} id="client-email" type="email" placeholder="marie@abc.ca" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            <Separator />

            <Controller
              name="line1"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="client-line1">Adresse</FieldLabel>
                  <Input {...field} id="client-line1" placeholder="1200 rue Principale" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>Facultative. D&apos;autres adresses s&apos;ajoutent depuis la fiche du client.</FieldDescription>
                  )}
                </Field>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <Controller
                name="city"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="client-city">Ville</FieldLabel>
                    <Input {...field} id="client-city" placeholder="Québec" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="apartment"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="client-apartment">Appart.</FieldLabel>
                    <Input {...field} id="client-apartment" placeholder="4B" aria-invalid={fieldState.invalid} />
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
                    <FieldLabel htmlFor="client-postal">Code postal</FieldLabel>
                    <Input {...field} id="client-postal" placeholder="G1R 2B5" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="province"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="client-province">Province</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="client-province" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROVINCES.map((province) => (
                          <SelectItem key={province} value={province}>
                            {province}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
            </div>

            <Controller
              name="country"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="client-country">Pays</FieldLabel>
                  <Input {...field} id="client-country" placeholder="Canada" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Separator />

            <Controller
              name="isTaxExempt"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="client-tax-exempt"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                    <FieldLabel htmlFor="client-tax-exempt" className="font-normal">
                      Non taxable
                    </FieldLabel>
                  </div>
                  <FieldDescription>
                    Les projets et les factures de ce client seront créés avec la case « non
                    taxable » déjà cochée. Chacun reste modifiable.
                  </FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="client-form" disabled={pending}>
            {pending && <Spinner />}
            {isEditing ? "Enregistrer" : "Créer le client"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
