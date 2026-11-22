"use client";

import Link from "next/link";
import { FileText, FolderKanban, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { EmptyState } from "@/components/layout/empty-state";
import { useAddressesQuery } from "@/hooks/use-addresses";
import { useInvoicesQuery } from "@/hooks/use-invoices";
import { useProjectsQuery } from "@/hooks/use-projects";
import { formatDateOnly } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { formatProjectNumber } from "@/lib/types";
import { invoiceStatusLabels, projectStatusLabels } from "@/lib/labels";

function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function ClientAddressesSection({ clientId }: { clientId: string }) {
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } = useAddressesQuery(1, "", clientId);
  const items = data?.items ?? [];

  return (
    <div>
      <SectionHeading
        title="Adresses"
        description="Celle du formulaire est marquée principale. Les autres servent à la livraison ou au chantier."
      />
      {isLoading ? (
        <Loading />
      ) : isError && (!data || isPlaceholderData) ? (
        /* An error is not an empty list — in every section here. Falling through to "aucun"
           tells someone this client's history is gone when a request merely failed.
           And `isError` alone is too wide: a failed background refetch keeps it true over rows
           that are still right, so the panel only wins with nothing read at all (`!data`) or rows
           left over from another query key (`isPlaceholderData`). */
        <LoadErrorState
          error={loadError}
          title="Adresses indisponibles"
          fallback="Les adresses de ce client n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Aucune adresse"
          description="Ajoutez une adresse depuis la fiche du client pour qu'elle apparaisse sur ses factures."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((address) => (
            <li key={address.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{address.line1}</span>
                {address.isPrimary && <Badge variant="default">Principale</Badge>}
                <Badge variant="secondary">{address.type}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {[address.line2, address.city, address.province, address.postalCode, address.country]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ClientProjectsSection({ clientId }: { clientId: string }) {
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } = useProjectsQuery(1, "", clientId);
  const items = data?.items ?? [];

  return (
    <div>
      <SectionHeading title="Projets" description="Les mandats en cours et passés pour ce client." />
      {isLoading ? (
        <Loading />
      ) : isError && (!data || isPlaceholderData) ? (
        <LoadErrorState
          error={loadError}
          title="Projets indisponibles"
          fallback="Les projets de ce client n'ont pas pu être chargés."
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Aucun projet"
          description="Les projets créés pour ce client apparaîtront ici."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((project) => (
            <li key={project.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
              <div className="min-w-0">
                <Link
                  href={`/projets/${project.id}`}
                  className="font-mono text-sm font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {formatProjectNumber(project.number)}
                </Link>
                {project.poNumber && (
                  <span className="ml-2 text-xs text-muted-foreground">PO {project.poNumber}</span>
                )}
                {project.description && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
                )}
              </div>
              <Badge variant="secondary" className="shrink-0">
                {projectStatusLabels[project.status]}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ClientInvoicesSection({ clientId }: { clientId: string }) {
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } = useInvoicesQuery(1, "", clientId);
  const items = data?.items ?? [];

  return (
    <div>
      <SectionHeading title="Factures" description="Tout ce qui a été facturé à ce client." />
      {isLoading ? (
        <Loading />
      ) : isError && (!data || isPlaceholderData) ? (
        <LoadErrorState
          error={loadError}
          title="Factures indisponibles"
          fallback="Les factures de ce client n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucune facture"
          description="Les factures émises à ce client apparaîtront ici."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((invoice) => (
            <li key={invoice.id}>
              {/* The whole row is the link: on a phone the number alone is a poor target. */}
              <Link
                href={`/factures/${invoice.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium text-foreground">{invoice.number}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateOnly(invoice.issueDate)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="tabular-nums text-foreground">
                    {formatCents(Math.round(invoice.total * 100), invoice.currency)}
                  </span>
                  <Badge variant="secondary">{invoiceStatusLabels[invoice.status]}</Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
