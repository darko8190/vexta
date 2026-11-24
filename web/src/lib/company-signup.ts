import * as z from "zod";

/** What a sign-up form has to hold for the company address fields to have somewhere to write. */
export type CompanyAddressValues = {
  line1: string;
  line2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  businessNumber: string;
};

/**
 * The address rules, shared by the email sign-up and the one that finishes a Google or
 * Microsoft sign-up.
 *
 * In one place because the server enforces the same rule on both routes. Written out twice,
 * they drift, and the way that shows up is a sign-up refused with a message but no field
 * marked -- the worst possible form error, because there is nothing to correct.
 *
 * Nothing is required of a personal space: it invoices nobody and has no address to print.
 */
export function checkCompanyAddress(
  values: CompanyAddressValues & { accountType: "business" | "personal" },
  ctx: z.RefinementCtx,
): void {
  if (values.accountType === "personal") return;

  const required: [keyof CompanyAddressValues, string][] = [
    ["line1", "L'adresse est requise."],
    ["city", "La ville est requise."],
    ["postalCode", "Le code postal est requis."],
    ["country", "Le pays est requis."],
  ];

  for (const [field, message] of required) {
    if (values[field].trim().length === 0) {
      ctx.addIssue({ code: "custom", message, path: [field] });
    }
  }
}

/** Blank values for a new form. */
export const emptyCompanyAddress = (country: string): CompanyAddressValues => ({
  line1: "",
  line2: "",
  city: "",
  province: "",
  postalCode: "",
  country,
  businessNumber: "",
});

/**
 * The address as the API wants it, or null for a personal space.
 *
 * Null rather than a set of empty strings: the server requires the address for a company and
 * refuses a blank one, so sending blanks would turn "we did not ask" into "they left it empty".
 */
export function companyProfileFrom(values: CompanyAddressValues, isPersonal: boolean) {
  if (isPersonal) return null;
  return {
    line1: values.line1.trim(),
    line2: values.line2.trim() || null,
    city: values.city.trim(),
    province: values.province.trim() || null,
    postalCode: values.postalCode.trim(),
    country: values.country.trim(),
    businessNumber: values.businessNumber.trim() || null,
  };
}
