"use client";

import { CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
import { ApiError } from "@/lib/api";

/**
 * What a list shows when it could not be read — which is not the same thing as a list with
 * nothing in it.
 *
 * The two were being drawn identically all over the application: a query that failed fell
 * through to "rien ici", so a screen told someone their employees, their products or their
 * invoices were gone when a request had merely failed. It even did it while the badge beside
 * the list still counted them. This says what happened, in the API's own words when it gave
 * any, and offers the one useful action.
 */
export function LoadErrorState({
  error,
  title = "Liste indisponible",
  fallback = "Ces données n'ont pas pu être chargées.",
  onRetry,
}: {
  error?: unknown;
  /** Named for what is missing: "Produits indisponibles", "Factures indisponibles". */
  title?: string;
  /** Used when the failure carried no message of its own. */
  fallback?: string;
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      icon={CloudOff}
      title={title}
      description={error instanceof ApiError ? error.message : fallback}
      action={onRetry ? <Button onClick={onRetry}>Réessayer</Button> : undefined}
    />
  );
}
