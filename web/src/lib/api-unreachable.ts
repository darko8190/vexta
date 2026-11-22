/**
 * How "the API could not be reached" is told apart from "the API said no".
 *
 * The two look alike at a glance and mean opposite things: one is a hiccup to ride out, the
 * other is a session that has ended. Conflating them signed people out of a perfectly good
 * session every time the back end restarted — which is every deploy, for anyone who happened
 * to refresh. The marker lives here, outside the server-only helper, so a client component can
 * recognise it without pulling `next/server` into the browser bundle.
 */
export const API_UNREACHABLE_HEADER = "x-vexta-api-unreachable";

export const API_UNREACHABLE_MESSAGE =
  "Le service est momentanément injoignable. Réessayez dans un instant.";
