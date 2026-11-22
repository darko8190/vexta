import * as z from "zod";

/**
 * The password rules, written once.
 *
 * These mirror what ASP.NET Identity is configured to enforce on the API
 * (`Program.cs`: RequiredLength 10, RequireNonAlphanumeric false, and the defaults for digit,
 * lowercase and uppercase). Three forms create a password — sign-up, an employee accepting an
 * invitation, and a super admin opening a tenant — and each of them used to check the length
 * alone. A ten-letter password passed every one of them and was then refused by the server,
 * which is a round trip the person did not need to make.
 *
 * Keep this in step with Program.cs: the server stays the authority, this is only the warning.
 */
export const PASSWORD_MIN_LENGTH = 10;

/** Said under the field, so the rule is known before the first attempt rather than after it. */
export const PASSWORD_HINT = "Au moins 10 caractères, dont une majuscule, une minuscule et un chiffre.";

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Au moins ${PASSWORD_MIN_LENGTH} caractères.`)
  .regex(/[a-z]/, "Il faut au moins une minuscule.")
  .regex(/[A-Z]/, "Il faut au moins une majuscule.")
  .regex(/[0-9]/, "Il faut au moins un chiffre.");
