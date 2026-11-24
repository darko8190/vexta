"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Blocks,
  Clock,
  FileText,
  FolderKanban,
  FolderOpen,
  HardHat,
  Info,
  ListChecks,
  MapPin,
  Plus,
  Receipt,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { InlineSheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { ProjectFormSheet } from "@/components/projects/project-form-sheet";
import { ProjectCostTable } from "@/components/projects/detail/project-cost-table";
import { ProjectDocumentsSection } from "@/components/projects/detail/project-documents-section";
import { ProjectExpensesSection } from "@/components/projects/detail/project-expenses-section";
import { ProjectExtraChargesSection } from "@/components/projects/detail/project-extra-charges-section";
import { ProjectMaterialsSection } from "@/components/projects/detail/project-materials-section";
import { ProjectTasksSection } from "@/components/projects/detail/project-tasks-section";
import { ProjectTimesheetsSection } from "@/components/projects/detail/project-timesheets-section";
import { ProjectInvoicesSection } from "@/components/projects/detail/project-invoices-section";
import { SectionPlaceholder } from "@/components/projects/detail/section-placeholder";
import { useIsClientUser } from "@/hooks/use-can-create";
import { useProjectQuery, useProjectSummaryQuery } from "@/hooks/use-projects";
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

function AddressBlock({ label, lines, note }: { label: string; lines: string[]; note?: string }) {
  return (
    <div>
      <dt className="mb-1 text-muted-foreground">
        {label}
        {note && <span className="ml-1.5 text-xs">{note}</span>}
      </dt>
      <dd className="flex items-start gap-1.5 text-foreground">
        {lines.length > 0 ? (
          <>
            <MapPin className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {lines.map((line) => (
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
  );
}

/**
 * One project. A project has no name of its own — it is its number, its client and the address
 * the work happens at, which is what the card at the top leads with. Everything that is tracked
 * against it hangs off the rail below, badge-counted so the whole job reads at a glance.
 */
export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isClient = useIsClientUser();
  const { data: project, isLoading, isError } = useProjectQuery(id);

  // The summary carries what a job cost and what it makes, so it is staff only — asking for it
  // as a customer would be a 403 on every page load.
  const { data: summary, isLoading: summaryLoading } = useProjectSummaryQuery(id, !isClient);

  const [section, setSection] = useState("details");

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

  // Billed means the invoice has gone out, so the figures behind it stop moving. Decided here,
  // once, and handed down: two places deciding the same lock eventually disagree.
  const locked = project.status === "Facture";

  const billing = addressLines(project.clientAddress);
  const site = project.sameAddressAsClient ? billing : addressLines(project.siteAddress);
  const counts = summary?.counts;

  // Détails carries no badge: it is one thing, not a list of them. Every other section counts
  // what is behind it, which is what the rail is for.
  //
  // A customer reading their own project gets the two sections that are theirs. The rest are
  // the company's internal record of the job — what it cost, who worked on it — and listing
  // them would be offering six doors that all answer "réservé à l'équipe".
  const sections: NavSection[] = isClient
    ? [
        { key: "details", label: "Détails", icon: Info },
        { key: "factures", label: "Factures", count: project.invoiceCount, icon: FileText },
      ]
    : [
        { key: "details", label: "Détails", icon: Info },
        // Second, right after the record: on a job in progress this is the list people open
        // first, and the badge counts what is left rather than what exists.
        { key: "taches", label: "Tâches", count: counts?.openTasks ?? 0, icon: ListChecks },
        { key: "materiaux", label: "Matériaux", count: counts?.materials ?? 0, icon: HardHat },
        { key: "equipements", label: "Équipements", count: counts?.equipment ?? 0, icon: Wrench },
        { key: "assemblages", label: "Assemblages", count: counts?.assemblies ?? 0, icon: Blocks },
        { key: "feuilles-de-temps", label: "Feuilles de temps", count: counts?.timesheets ?? 0, icon: Clock },
        { key: "depenses", label: "Dépenses", count: counts?.expenses ?? 0, icon: Receipt },
        { key: "frais", label: "Frais supplémentaires", count: counts?.extraCharges ?? 0, icon: Plus },
        {
          key: "documents",
          label: "Documents et notes",
          count: counts?.documentsAndNotes ?? 0,
          icon: FolderOpen,
        },
        { key: "factures", label: "Factures", count: counts?.invoices ?? project.invoiceCount, icon: FileText },
      ];

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
              {project.isTaxExempt && <Badge variant="outline">Non taxable</Badge>}
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

        </div>
      </div>

      {/* The rail sits beside the content from md up and becomes a scrollable row below it. */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav
          sections={sections}
          active={section}
          onSelect={setSection}
          label="Sections du projet"
        />

        <div className="min-w-0 flex-1">
          {/* Staff edit the job where they read it: the form is the section, with one
              Enregistrer, instead of a summary and a Modifier that opened the same fields. */}
          {section === "details" && !isClient && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-foreground">Détails</h2>
                <p className="text-sm text-muted-foreground">
                  Modifiez les champs directement, puis enregistrez.
                </p>
              </div>
              <InlineSheet>
                <ProjectFormSheet open onOpenChange={() => {}} project={project} />
              </InlineSheet>
              <ProjectCostTable costs={summary?.costs} isLoading={summaryLoading} />
            </div>
          )}

          {/* A customer reads their job; nothing on it is theirs to change. */}
          {section === "details" && isClient && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-foreground">Détails</h2>
                <p className="text-sm text-muted-foreground">L&apos;échéancier, les adresses et l&apos;argent.</p>
              </div>

              <dl className="grid gap-4 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Échéancier</dt>
                  <dd className="text-foreground">
                    {project.startDate ?? "—"} → {project.endDate ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Budget</dt>
                  <dd className="text-foreground tabular-nums">{money(project.budget)}</dd>
                </div>

                {/* Only when there is one. An empty row saying "—" on every job of every trade
                    that does not work on things would be a column of nothing. */}
                {project.clientAssetLabel && (
                  <div>
                    <dt className="text-muted-foreground">Actif</dt>
                    <dd className="text-foreground">
                      <Link
                        href={`/clients/${project.clientId}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {project.clientAssetLabel}
                      </Link>
                    </dd>
                  </div>
                )}

                {/* Same rule as the asset: shown only when the job has one. */}
                {project.categoryName && (
                  <div>
                    <dt className="text-muted-foreground">Catégorie</dt>
                    <dd className="text-foreground">
                      {project.categoryName}
                      {project.subCategoryName && ` › ${project.subCategoryName}`}
                    </dd>
                  </div>
                )}
                {project.wageClassificationName && (
                  <div>
                    <dt className="text-muted-foreground">Classement</dt>
                    <dd className="text-foreground">{project.wageClassificationName}</dd>
                  </div>
                )}

                <AddressBlock label="Adresse de facturation" lines={billing} />
                <AddressBlock
                  label="Adresse des travaux"
                  lines={site}
                  note={project.sameAddressAsClient && site.length > 0 ? "(même adresse)" : undefined}
                />
              </dl>

            </div>
          )}

          {/* No `locked`: the invoice says what the client owes, not that the punch list is
              finished. A billed job can still have work to tick off. */}
          {section === "taches" && <ProjectTasksSection projectId={project.id} />}

          {section === "materiaux" && <ProjectMaterialsSection projectId={project.id} locked={locked} />}

          {section === "equipements" && (
            <SectionPlaceholder
              icon={Wrench}
              title="Équipements"
              description="Ce qui est loué ou sorti de l'inventaire pour ce projet."
            />
          )}

          {section === "assemblages" && (
            <SectionPlaceholder
              icon={Blocks}
              title="Assemblages"
              description="Les ensembles préparés d'avance et installés tels quels."
            />
          )}

          {section === "feuilles-de-temps" && (
            <ProjectTimesheetsSection projectId={project.id} locked={locked} />
          )}

          {section === "depenses" && <ProjectExpensesSection projectId={project.id} locked={locked} />}

          {section === "frais" && (
            <ProjectExtraChargesSection projectId={project.id} locked={locked} />
          )}

          {section === "documents" && <ProjectDocumentsSection projectId={project.id} />}

          {section === "factures" && (
            <ProjectInvoicesSection projectId={project.id} clientId={project.clientId} />
          )}
        </div>
      </div>

    </div>
  );
}
