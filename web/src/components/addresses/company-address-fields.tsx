"use client";

import { Controller, useWatch, type FieldPath, type FieldValues, type UseFormReturn } from "react-hook-form";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CountrySelect, SubdivisionField } from "@/components/addresses/country-field";
import { isKnownSubdivision, subdivisionLabel } from "@/lib/geo";
import type { CompanyAddressValues } from "@/lib/company-signup";
import { ex } from "@/lib/placeholders";

/**
 * The company's address and registration number, as asked at sign-up.
 *
 * Shared between the email form and the one that finishes a Google or Microsoft sign-up,
 * because the server requires the address on both and the two screens drifting apart would show
 * up as a sign-up that is refused with no field to blame. Everything else in this application
 * writes its own fields inline; these are shared precisely because a rule enforced elsewhere
 * depends on them.
 */
export function CompanyAddressFields<T extends FieldValues & CompanyAddressValues>({
  form,
  idPrefix,
}: {
  form: UseFormReturn<T>;
  idPrefix: string;
}) {
  // The field names are known to exist by the constraint on T, but react-hook-form resolves
  // FieldPath<T> structurally and cannot see that from inside a generic, so each one is named
  // once here rather than cast at every use.
  const name = {
    line1: "line1" as FieldPath<T>,
    line2: "line2" as FieldPath<T>,
    city: "city" as FieldPath<T>,
    province: "province" as FieldPath<T>,
    postalCode: "postalCode" as FieldPath<T>,
    country: "country" as FieldPath<T>,
    businessNumber: "businessNumber" as FieldPath<T>,
  };

  // The province field is a list for some countries and a plain box for the others.
  const country = useWatch({ control: form.control, name: name.country }) as string;

  return (
    <>
      <Controller
        name={name.businessNumber}
        control={form.control}
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-neq`}>Numéro d&apos;entreprise (optionnel)</FieldLabel>
            <Input {...field} value={field.value ?? ""} id={`${idPrefix}-neq`} placeholder={ex("1234567890")} />
          </Field>
        )}
      />

      <Controller
        name={name.line1}
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${idPrefix}-line1`}>Adresse</FieldLabel>
            <Input
              {...field}
              value={field.value ?? ""}
              id={`${idPrefix}-line1`}
              placeholder={ex("123 rue Principale")}
              aria-invalid={fieldState.invalid}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      <Controller
        name={name.line2}
        control={form.control}
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-line2`}>Complément (optionnel)</FieldLabel>
            <Input {...field} value={field.value ?? ""} id={`${idPrefix}-line2`} placeholder={ex("Bureau 200")} />
          </Field>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          name={name.city}
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${idPrefix}-city`}>Ville</FieldLabel>
              <Input
                {...field}
                value={field.value ?? ""}
                id={`${idPrefix}-city`}
                placeholder={ex("Québec")}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name={name.postalCode}
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${idPrefix}-postal`}>Code postal</FieldLabel>
              <Input
                {...field}
                value={field.value ?? ""}
                id={`${idPrefix}-postal`}
                placeholder={ex("G1R 2B5")}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          name={name.country}
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${idPrefix}-country`}>Pays</FieldLabel>
              <CountrySelect
                id={`${idPrefix}-country`}
                value={(field.value ?? "") as string}
                onChange={(next) => {
                  field.onChange(next);
                  // A province the new country does not have cannot stay behind: this address
                  // is printed on every invoice the company issues.
                  if (!isKnownSubdivision(next, form.getValues(name.province) as string)) {
                    form.setValue(name.province, "" as never);
                  }
                }}
                invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name={name.province}
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-province`}>{subdivisionLabel(country)}</FieldLabel>
              <SubdivisionField
                id={`${idPrefix}-province`}
                value={(field.value ?? "") as string}
                onChange={field.onChange}
                countryName={country}
              />
            </Field>
          )}
        />
      </div>
    </>
  );
}
