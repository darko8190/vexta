import { redirect } from "next/navigation";

/**
 * Achats has no page of its own yet — only Dépenses under it.
 *
 * A redirect rather than a landing page of one card: the heading exists so that purchase orders
 * and suppliers have somewhere to go later, and until they do, clicking it should take somebody
 * to the thing that is actually there.
 */
export default function PurchasingPage() {
  redirect("/achats/depenses");
}
