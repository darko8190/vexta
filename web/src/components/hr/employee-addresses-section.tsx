"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { Home, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { EmployeePicker } from "@/components/team/employee-picker";
import {
  useDeleteEmployeeAddress,
  useEmployeeAddressesQuery,
  useSaveEmployeeAddress,
} from "@/hooks/use-employee-file";
import { CountrySelect, SubdivisionField } from "@/components/addresses/country-field";
import { ApiError } from "@/lib/api";
import { defaultCountryName, isKnownSubdivision, subdivisionLabel } from "@/lib/geo";
import { ex } from "@/lib/placeholders";
import type { EmployeeAddress } from "@/lib/types";
import { rowOpenClassName, rowOpenProps } from "@/components/layout/row-open";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  employeeId: z.string().min(1, "Choisissez à qui cette adresse appartient."),
  label: z.string().trim().max(60, "60 caractères maximum."),
  line1: z.string().trim().min(1, "L'adresse est requise.").max(200, "200 caractères maximum."),
  line2: z.string().trim().max(200, "200 caractères maximum."),
  city: z.string().trim().min(1, "La ville est requise.").max(100, "100 caractères maximum."),
  province: z.string().trim().max(60, "60 caractères maximum."),
  postalCode: z.string().trim().min(1, "Le code postal est requis.").max(20, "20 caractères maximum."),
  country: z.string().trim().max(60, "60 caractères maximum."),
  isPrimary: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(address: EmployeeAddress | undefined, employeeId: string | undefined): FormValues {
  return {
    employeeId: address?.employeeId ?? employeeId ?? "",
    label: address?.label ?? "",
    line1: address?.line1 ?? "",
    line2: address?.line2 ?? "",
    city: address?.city ?? "",
    province: address?.province ?? "Québec",
    postalCode: address?.postalCode ?? "",
    country: address?.country ?? defaultCountryName,
    isPrimary: address?.isPrimary ?? false,
  };
}

function AddressFormSheet({
  open,
  onOpenChange,
  address,
  employeeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address?: EmployeeAddress;
  /** Set on an employee's own card: the person is decided, so the picker is not offered. */
  employeeId?: string;
}) {
  const isEditing = Boolean(address);
  const save = useSaveEmployeeAddress();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(address, employeeId),
  });

  // Watched rather than read once: the province field is a list for some countries and a
  // plain box for the others, and it has to change the moment the country does.
  const country = useWatch({ control: form.control, name: "country" });

  async function onSubmit(values: FormValues) {
    try {
      await save.mutateAsync({
        id: address?.id ?? null,
        values: {
          employeeId: values.employeeId,
          label: values.label || null,
          isPrimary: values.isPrimary,
          line1: values.line1,
          line2: values.line2 || null,
          city: values.city,
          province: values.province || null,
          postalCode: values.postalCode,
          country: values.country || defaultCountryName,
        },
      });
      toast.success(isEditing ? "Adresse mise à jour." : "Adresse ajoutée.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer cette adresse.");
    }
  }

  // The only main address cannot be unticked: somebody has to be reachable by mail.
  const lockedPrimary = isEditing && Boolean(address?.isPrimary);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier l'adresse" : "Nouvelle adresse"}</SheetTitle>
          <SheetDescription>
            Où habite la personne. Les lieux de l&apos;entreprise — siège social, entrepôt, cour —
            sont sur la fiche de l&apos;entreprise.
          </SheetDescription>
        </SheetHeader>

        <form
          id="employee-address-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <FieldGroup>
            {!employeeId && (
              <Controller
                name="employeeId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="address-employee">Employé</FieldLabel>
                    <EmployeePicker
                      id="address-employee"
                      value={field.value}
                      onChange={field.onChange}
                      invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            )}

            <Controller
              name="line1"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="address-line1">Adresse</FieldLabel>
                  <Input {...field} id="address-line1" placeholder={ex("1200 rue Principale")} aria-invalid={fieldState.invalid} />
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
                    <FieldLabel htmlFor="address-city">Ville</FieldLabel>
                    <Input {...field} id="address-city" placeholder={ex("Québec")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="line2"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="address-line2">Appartement</FieldLabel>
                    <Input {...field} id="address-line2" placeholder={ex("3")} aria-invalid={fieldState.invalid} />
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
                    <FieldLabel htmlFor="address-postal">Code postal</FieldLabel>
                    <Input {...field} id="address-postal" placeholder={ex("G1R 2B5")} aria-invalid={fieldState.invalid} />
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
                    <CountrySelect
                      id="address-country"
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
                    <FieldLabel htmlFor="address-province">{subdivisionLabel(country)}</FieldLabel>
                    <SubdivisionField
                      id="address-province"
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
                name="label"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="address-label">Nom</FieldLabel>
                    <Input {...field} id="address-label" placeholder={ex("Domicile")} aria-invalid={fieldState.invalid} />
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
                    id="address-primary"
                    checked={field.value}
                    disabled={lockedPrimary}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <FieldLabel htmlFor="address-primary">Adresse principale</FieldLabel>
                </Field>
              )}
            />
            <FieldDescription>
              {lockedPrimary
                ? "C'est déjà l'adresse principale. Pour la changer, cochez cette case sur une autre adresse."
                : "Celle que la paie et les relevés fiscaux utilisent."}
            </FieldDescription>
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="employee-address-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {isEditing ? "Enregistrer" : "Ajouter l'adresse"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Where the people who work here live.
 *
 * The same component serves the department's list and one person's card. On a card the employee
 * is decided, so the picker disappears and the names stop being repeated down the page.
 */
export function EmployeeAddressesSection({ employeeId }: { employeeId?: string }) {
  const { data, isLoading, isError, error, refetch } = useEmployeeAddressesQuery(employeeId);
  const remove = useDeleteEmployeeAddress();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeAddress | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeAddress | undefined>(undefined);

  // The sheet is remounted per target rather than reset by an effect: a key that changes is
  // what makes the form forget the last address without React having to be told twice.
  const formKey = `${editing?.id ?? "nouvelle"}-${formOpen}`;

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Adresse retirée.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de retirer cette adresse.");
    }
  }

  const addButton = (
    <Button onClick={openCreate}>
      <Plus />
      Ajouter une adresse
    </Button>
  );

  const items = data ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Adresses</h2>
          <p className="text-sm text-muted-foreground">
            Où habitent vos employés. Chaque adresse appartient à quelqu&apos;un.
          </p>
        </div>
        {addButton}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Adresses indisponibles"
          fallback="Les adresses n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Home}
          title="Aucune adresse"
          description="Ajoutez l'adresse d'un employé : c'est celle que la paie et les relevés fiscaux utilisent."
          action={addButton}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((address) => (
            <li
              key={address.id}
              {...rowOpenProps(() => { setEditing(address); setFormOpen(true); }, "Ouvrir la fiche")}
              className={cn("flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3", rowOpenClassName)}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {/* The name leads on the department's list and is dropped on a card, where
                      repeating it on every row says nothing. */}
                  {!employeeId && (
                    <span className="font-medium text-foreground">{address.employeeName}</span>
                  )}
                  {address.label && <Badge variant="secondary">{address.label}</Badge>}
                  {address.isPrimary && <Badge variant="default">Principale</Badge>}
                </div>
                <p className={employeeId ? "text-sm text-foreground" : "mt-1 text-sm text-muted-foreground"}>
                  {[address.line1, address.line2, address.city, address.province, address.postalCode]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon" className="shrink-0" aria-label="Actions sur cette adresse">
                      <MoreHorizontal />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(address);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil />
                    Modifier
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(address)}>
                    <Trash2 />
                    Retirer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <AddressFormSheet
        key={formKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        address={editing}
        employeeId={employeeId}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Retirer cette adresse ?"
        description={`${deleteTarget?.line1 ?? ""} sera retirée du dossier. Si c'était l'adresse principale, la plus ancienne qui reste la remplace.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
