"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardPen, FileText, FolderKanban, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { EmptyState } from "@/components/layout/empty-state";
import { AddressFormSheet } from "@/components/addresses/address-form-sheet";
import { ProjectFormSheet } from "@/components/projects/project-form-sheet";
import { useCanCreate } from "@/hooks/use-can-create";
import { useAddressesQuery } from "@/hooks/use-addresses";
import { useInvoicesQuery } from "@/hooks/use-invoices";
import { useProjectsQuery } from "@/hooks/use-projects";
import { useQuotesQuery } from "@/hooks/use-quotes";
import { QuoteFormSheet } from "@/components/quotes/quote-form-sheet";
import { rowOpenClassName, rowOpenProps } from "@/components/layout/row-open";
import { formatAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import { formatDateOnly } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { formatProjectNumber, formatQuoteNumber } from "@/lib/types";
import { invoiceStatusLabels, projectStatusLabels, quoteStatusBadgeVariant, quoteStatusLabels } from "@/lib/labels";
import type { AddressRecord } from "@/lib/types";

function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  /** The button that starts a record of this kind, when the section offers one. */
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function ClientAddressesSection({ clientId }: { clientId: string }) {
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } = useAddressesQuery(1, "", clientId);
  const canCreate = useCanCreate();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AddressRecord | undefined>(undefined);
  const items = data?.items ?? [];

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  // An address added with no way to correct it is half a feature, and the sheet already knows
  // how to edit one. A row opens it on the record it shows.
  function openEdit(address: AddressRecord) {
    if (!canCreate) return;
    setEditing(address);
    setFormOpen(true);
  }

  const addButton = canCreate ? (
    <Button onClick={openCreate}>
      <Plus />
      Ajouter une adresse
    </Button>
  ) : undefined;

  return (
    <div>
      <SectionHeading
        title="Adresses"
        description="Celle du formulaire est marquée principale. Les autres servent à la livraison ou au chantier."
        action={addButton}
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
          description="Une adresse de chantier, une adresse de livraison, ou celle qui paraîtra sur ses factures."
          action={addButton}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((address) => {
            const body = (
              <>
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
              </>
            );

            return (
              <li key={address.id}>
                {canCreate ? (
                  <button
                    type="button"
                    onClick={() => openEdit(address)}
                    className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="rounded-lg border border-border bg-card p-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {formOpen && (
        <AddressFormSheet
          open={formOpen}
          onOpenChange={setFormOpen}
          address={editing}
          defaultClientId={clientId}
        />
      )}
    </div>
  );
}

/**
 * This client's jobs, and the way to start another one.
 *
 * The button is here rather than only on the projects page because this is where somebody is
 * standing when a client calls for more work: the client is already chosen, so the form opens
 * with them filled in and nobody has to go and find them again in a list.
 */
export function ClientProjectsSection({ clientId }: { clientId: string }) {
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } = useProjectsQuery(1, "", clientId);
  const canCreate = useCanCreate();
  const [formOpen, setFormOpen] = useState(false);
  const items = data?.items ?? [];

  const addButton = canCreate ? (
    <Button onClick={() => setFormOpen(true)}>
      <Plus />
      Nouveau projet
    </Button>
  ) : undefined;

  return (
    <div>
      <SectionHeading
        title="Projets"
        description="Les mandats en cours et passés pour ce client."
        action={addButton}
      />
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
          description="Créez-en un : le client est déjà choisi, il ne reste qu'à décrire le mandat."
          action={addButton}
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

      {/* Remounted each time it opens, so a form abandoned halfway does not come back
          half-filled the next time somebody presses the button. */}
      <ProjectFormSheet
        key={String(formOpen)}
        open={formOpen}
        onOpenChange={setFormOpen}
        defaultClientId={clientId}
      />
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

/** The prices given to this client, newest first. Pressing one opens it. */
export function ClientQuotesSection({ clientId }: { clientId: string }) {
  const router = useRouter();
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } = useQuotesQuery(
    1,
    "",
    undefined,
    clientId,
  );
  const canCreate = useCanCreate();
  const [formOpen, setFormOpen] = useState(false);
  const items = data?.items ?? [];

  const addButton = canCreate ? (
    <Button onClick={() => setFormOpen(true)}>
      <Plus />
      Nouvelle soumission
    </Button>
  ) : undefined;

  return (
    <div>
      <SectionHeading
        title="Soumissions"
        description="Les prix donnés à ce client, et ce qu'ils sont devenus."
        action={addButton}
      />
      {isLoading ? (
        <Loading />
      ) : isError && (!data || isPlaceholderData) ? (
        <LoadErrorState
          error={loadError}
          title="Soumissions indisponibles"
          fallback="Les soumissions de ce client n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ClipboardPen}
          title="Aucune soumission"
          description="Préparez un prix pour ce client : le client est déjà choisi."
          action={addButton}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((quote) => (
            <li
              key={quote.id}
              {...rowOpenProps(
                () => router.push(`/soumissions/${quote.id}`),
                `Ouvrir la soumission ${formatQuoteNumber(quote.number)}`,
              )}
              className={cn(
                "flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3",
                rowOpenClassName,
              )}
            >
              <div className="min-w-0">
                <span className="font-mono text-sm font-medium text-foreground">
                  {formatQuoteNumber(quote.number)}
                </span>
                <span className="ml-2 text-sm tabular-nums text-muted-foreground">
                  {formatAmount(quote.subtotal)}
                </span>
                {quote.description && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{quote.description}</p>
                )}
              </div>
              <Badge variant={quoteStatusBadgeVariant[quote.status]} className="shrink-0">
                {quoteStatusLabels[quote.status]}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <QuoteFormSheet
        key={String(formOpen)}
        open={formOpen}
        onOpenChange={setFormOpen}
        defaultClientId={clientId}
        onCreated={(created) => router.push(`/soumissions/${created.id}`)}
      />
    </div>
  );
}
