"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FolderKanban, MapPin, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { ProjectFormSheet } from "@/components/projects/project-form-sheet";
import { useIsClientUser } from "@/hooks/use-can-create";
import { useProjectQuery } from "@/hooks/use-projects";
import { projectStatusBadgeVariant, projectStatusLabels } from "@/lib/labels";
import { formatProjectNumber, type ProjectAddress } from "@/lib/types";
import { cn } from "@/lib/utils";

function addressLines(address: ProjectAddress | null | undefined): string[] {
  if (!address) return [];
  return [
    [address.line1, address.line2].filter(Boolean).join(", "),
    [address.city, address.province, address.postalCode].filter(Boolean).join(", "),
  ].filter(Boolean);
}

function money(amount: number | null) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(amount);
}

/**
 * One project. A project has no name of its own — it is its number, its client and the address
 * the work happens at, which is what this page leads with.
 */
export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isClient = useIsClientUser();
  const { data: project, isLoading, isError } = useProjectQuery(id);
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !project) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="Projet introuvable"
        description="Ce projet n'existe plus, ou vous n'y avez pas accès."
        action={
          <Link href="/projets" className={cn(buttonVariants())}>
            Retour aux projets
          </Link>
        }
      />
    );
  }

  const billing = addressLines(project.clientAddress);
  const site = project.sameAddressAsClient ? billing : addressLines(project.siteAddress);

  return (
    <div>
      <Link
        href="/projets"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Projets
      </Link>

      <div className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {formatProjectNumber(project.number)}
              </span>
              <Badge variant={projectStatusBadgeVariant[project.status]}>
                {projectStatusLabels[project.status]}
              </Badge>
              {project.poNumber && <Badge variant="secondary">PO {project.poNumber}</Badge>}
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              <Link href={`/clients/${project.clientId}`} className="underline-offset-4 hover:underline">
                {project.clientName}
              </Link>
            </h1>
            {project.description && (
              <p className="mt-2 max-w-prose whitespace-pre-line text-sm text-muted-foreground">
                {project.description}
              </p>
            )}
          </div>

          {!isClient && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil />
              Modifier
            </Button>
          )}
        </div>

        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Échéancier</dt>
            <dd className="text-foreground">
              {project.startDate ?? "—"} → {project.endDate ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Budget</dt>
            <dd className="text-foreground">{money(project.budget)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Factures</dt>
            <dd className="text-foreground tabular-nums">{project.invoiceCount}</dd>
          </div>
        </dl>

        <div className="mt-5 grid gap-4 border-t border-border pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="mb-1 text-muted-foreground">Adresse de facturation</dt>
            <dd className="flex items-start gap-1.5 text-foreground">
              {billing.length > 0 ? (
                <>
                  <MapPin className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {billing.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Aucune</span>
              )}
            </dd>
          </div>

          <div>
            <dt className="mb-1 text-muted-foreground">
              Adresse des travaux
              {project.sameAddressAsClient && site.length > 0 && (
                <span className="ml-1.5 text-xs">(même adresse)</span>
              )}
            </dt>
            <dd className="flex items-start gap-1.5 text-foreground">
              {site.length > 0 ? (
                <>
                  <MapPin className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {site.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Aucune</span>
              )}
            </dd>
          </div>
        </div>
      </div>

      <ProjectFormSheet open={editOpen} onOpenChange={setEditOpen} project={project} />
    </div>
  );
}
