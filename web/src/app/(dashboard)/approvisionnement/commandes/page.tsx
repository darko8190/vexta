import { redirect } from "next/navigation";

/**
 * A section of Fournisseurs & Commandes, not a page of its own.
 *
 * The redirect stays because the address was live for a while: a bookmark, or a module somebody
 * created pointing here, should land on the screen rather than on a 404.
 */
export default function Redirect() {
  redirect("/approvisionnement");
}
