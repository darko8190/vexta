import { redirect } from "next/navigation";

/**
 * Paiements is a section of Facturation, not a page of its own.
 *
 * The redirect stays because the address was live for a while: a bookmark, or a module somebody
 * created pointing here, should land on the screen rather than on a 404.
 */
export default function PaymentsRedirect() {
  redirect("/factures");
}
