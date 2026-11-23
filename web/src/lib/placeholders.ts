/**
 * The prefix every example placeholder carries.
 *
 * One constant, so changing "ex. :" into anything else is one edit and not a hundred and
 * thirty. "ex." is the French abbreviation of "exemple" and takes its period; the colon is
 * spaced, as French punctuation is.
 */
const PREFIX = "ex. :";

/**
 * Marks a placeholder as an example rather than as an instruction.
 *
 * Without it, "Toyota" in a greyed-out field reads as a value somebody already entered, and
 * people type around it or delete it. With it, nobody has to wonder.
 *
 * Only for examples. A field whose placeholder is a prompt — "Rechercher un client…",
 * "Choisir un employé" — is not showing an example of an answer, it is saying what to do, and
 * putting "ex. :" in front of it would turn an instruction into nonsense. Password dots are not
 * examples either.
 */
export function ex(example: string): string {
  return `${PREFIX} ${example}`;
}
