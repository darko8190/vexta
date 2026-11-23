import { redirect } from "next/navigation";

/**
 * Fournisseurs & Commandes has three screens under it and none of its own.
 *
 * A redirect rather than a landing page: the supplier list is where the work starts, because
 * an order cannot be written before somebody has been recorded to order from.
 */
export default function SupplyPage() {
  redirect("/approvisionnement/fournisseurs");
}
