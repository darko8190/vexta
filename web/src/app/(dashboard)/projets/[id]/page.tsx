"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Blocks,
  BookmarkPlus,
  ClipboardPen,
  Clock,
  FileText,
  FolderKanban,
  FolderOpen,
  HardHat,
  Info,
  ListChecks,
  MapPin,
  Package,
  Plus,
  Receipt,
  UserRound,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { ClientQuickView } from "@/components/clients/client-quick-view";
import { useProjectTasksQuery } from "@/hooks/use-project-tasks";
import { useSaveProjectAsTemplate } from "@/hooks/use-project-templates";
import { ApiError } from "@/lib/api";
import { formatDateOnly } from "@/lib/dates";
import { taskStatusBadgeVariant, taskStatusLabels } from "@/lib/labels";
import { InlineSheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { ProjectFormSheet } from "@/components/projects/project-form-sheet";
import { ProjectStatusSelect } from "@/components/projects/project-status-select";
import { BilledNotice } from "@/components/projects/detail/billed-notice";
import { ProjectCostTable } from "@/components/projects/detail/project-cost-table";
import { ProjectDocumentsSection } from "@/components/projects/detail/project-documents-section";
import { ProjectEquipmentSection } from "@/components/projects/detail/project-equipment-section";
import { ProjectExpensesSection } from "@/components/projects/detail/project-expenses-section";
import { ProjectExtraChargesSection } from "@/components/projects/detail/project-extra-charges-section";
import { ProjectMaterialsSection } from "@/components/projects/detail/project-materials-section";
import { ProjectTasksSection } from "@/components/projects/detail/project-tasks-section";
import { ProjectTimesheetsSection } from "@/components/projects/detail/project-timesheets-section";
import { ProjectInvoicesSection } from "@/components/projects/detail/project-invoices-section";
import { ProjectAssembliesSection } from "@/components/projects/detail/project-assemblies-section";
import { useCanManage, useIsClientUser, useIsCrewView } from "@/hooks/use-can-create";
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
  // The crew's own view of a job: what to do and where, never what it is worth.
  const crew = useIsCrewView();
  const canManage = useCanManage();
  const [viewingClient, setViewingClient] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
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
  const review = (n: number | undefined) => (crew ? 0 : (n ?? 0));
  const sections: NavSection[] = isClient
    ? [
        { key: "details", label: "Détails", icon: Info },
        { key: "factures", label: "Factures", count: project.invoiceCount, icon: FileText },
      ]
    : crew
    ? [
        { key: "details", label: "Détails", icon: Info },
        { key: "taches", label: "Tâches", count: counts?.openTasks ?? 0, icon: ListChecks },
        { key: "materiaux", label: "Matériaux", count: counts?.materials ?? 0, icon: HardHat },
        { key: "equipements", label: "Équipements", count: counts?.equipment ?? 0, icon: Wrench },
        { key: "assemblages", label: "Assemblages", count: counts?.assemblies ?? 0, icon: Blocks },
        { key: "feuilles-de-temps", label: "Poinçons", count: counts?.timesheets ?? 0, icon: Clock },
        { key: "depenses", label: "Dépenses", count: counts?.expenses ?? 0, icon: Receipt },
        { key: "documents", label: "Documents et notes", count: counts?.documentsAndNotes ?? 0, icon: FolderOpen },
      ]
    : [
        { key: "details", label: "Détails", icon: Info },
        // Second, right after the record: on a job in progress this is the list people open
        // first, and the badge counts what is left rather than what exists.
        { key: "taches", label: "Tâches", count: counts?.openTasks ?? 0, icon: ListChecks },
        {
          key: "materiaux",
          label: "Matériaux",
          count: counts?.materials ?? 0,
          icon: HardHat,
          alert: review(counts?.materialsToReview),
          alertLabel: "Des matériaux ajoutés à la main n'ont pas de prix",
        },
        {
          key: "equipements",
          label: "Équipements",
          count: counts?.equipment ?? 0,
          icon: Wrench,
          alert: review(counts?.equipmentToReview),
          alertLabel: "Des équipements saisis à la main n'ont pas de prix",
        },
        { key: "assemblages", label: "Assemblages", count: counts?.assemblies ?? 0, icon: Blocks },
        {
          key: "feuilles-de-temps",
          label: "Poinçons",
          count: counts?.timesheets ?? 0,
          icon: Clock,
          alert: review(counts?.timesheetsToReview),
          alertLabel: "Des heures reviennent à 0 $ : aucun taux horaire",
        },
        { key: "depenses", label: "Dépenses", count: counts?.expenses ?? 0, icon: Receipt },
        { key: "frais", label: "Frais supplémentaires", count: counts?.extraCharges ?? 0, icon: Plus },
        // The quote the job came from, when it came from one.
        ...(summary?.quoteId
          ? [{ key: "soumission", label: "Soumission", count: counts?.quotes ?? 1, icon: ClipboardPen }]
          : []),
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
              {/* Staff move the state from here; a customer only reads it. */}
              {isClient ? (
                <Badge variant={projectStatusBadgeVariant[project.status]}>
                  {projectStatusLabels[project.status]}
                </Badge>
              ) : (
                <ProjectStatusSelect project={project} />
              )}
              {project.recurrenceEvery != null && <Badge variant="outline">Récurrent</Badge>}
              {project.poNumber && <Badge variant="secondary">PO {project.poNumber}</Badge>}
              {project.isTaxExempt && <Badge variant="outline">Non taxable</Badge>}
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {isClient ? (
                project.clientName
              ) : (
                <button type="button" onClick={() => setViewingClient(true)} className="text-left underline-offset-4 hover:underline">
                  {project.clientName}
                </button>
              )}
            </h1>
            {project.description && (
              <p className="mt-2 max-w-prose whitespace-pre-line text-sm text-muted-foreground">
                {project.description}
              </p>
            )}
          </div>

          {/* Straight to the records this job hangs off. */}
          {!isClient && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setViewingClient(true)}>
                <UserRound />
                Fiche du client
              </Button>
              {summary?.quoteId && (
                <Link href={`/soumissions/${summary.quoteId}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                  <ClipboardPen />
                  Soumission {summary.quoteLabel}
                </Link>
              )}
              {canManage && (
                <Button variant="outline" size="sm" onClick={() => setSavingTemplate(true)}>
                  <BookmarkPlus />
                  Enregistrer comme modèle
                </Button>
              )}
              {project.clientAssetId && (
                <Link
                  href={`/clients/${project.clientId}/actifs/${project.clientAssetId}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  <Package />
                  Fiche de l&apos;actif
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {locked && !isClient && !crew && <BilledNotice projectId={project.id} className="mb-6" />}

      {/* The rail sits beside the content from md up and becomes a scrollable row below it.
          From xl, the money joins them as a third column: the job's figures stay in view
          whichever section is open, instead of living at the bottom of Détails. */}
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
          {section === "details" && crew && <CrewDetails project={project} billing={billing} site={site} />}

          {section === "details" && !isClient && !crew && (
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
              {/* Below xl there is no third column, so the figures sit under the record. */}
              <div className="xl:hidden">
                <ProjectCostTable costs={summary?.costs} isLoading={summaryLoading} />
              </div>
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
                        href={project.clientAssetId ? `/clients/${project.clientId}/actifs/${project.clientAssetId}` : `/clients/${project.clientId}`}
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

                {project.contactName && (
                  <div>
                    <dt className="text-muted-foreground">Contact du projet</dt>
                    <dd className="text-foreground">{project.contactName}</dd>
                  </div>
                )}
                {project.billingContactName && (
                  <div>
                    <dt className="text-muted-foreground">Contact de facturation</dt>
                    <dd className="text-foreground">{project.billingContactName}</dd>
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

          {section === "equipements" && <ProjectEquipmentSection projectId={project.id} locked={locked} />}

          {section === "assemblages" && <ProjectAssembliesSection projectId={project.id} locked={locked} />}

          {section === "feuilles-de-temps" && (
            <ProjectTimesheetsSection projectId={project.id} locked={locked} />
          )}

          {section === "depenses" && <ProjectExpensesSection projectId={project.id} locked={locked} />}

          {section === "frais" && (
            <ProjectExtraChargesSection projectId={project.id} locked={locked} />
          )}

          {section === "documents" && <ProjectDocumentsSection projectId={project.id} />}

          {section === "factures" && !crew && (
            <ProjectInvoicesSection projectId={project.id} clientId={project.clientId} />
          )}

          {section === "soumission" && summary?.quoteId && (
            <div className="max-w-xl rounded-lg border border-border bg-card p-4">
              <h2 className="text-base font-semibold text-foreground">Soumission {summary.quoteLabel}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ce projet a été créé à partir de cette soumission : ses lignes, ses prix et la réponse du client y sont gardés.
              </p>
              <Link href={`/soumissions/${summary.quoteId}`} className={cn(buttonVariants(), "mt-3")}>
                <ClipboardPen />
                Ouvrir la soumission
              </Link>
            </div>
          )}
        </div>

        {!isClient && !crew && (
          <aside
            aria-label="Montants du projet"
            // Wide enough for five columns of money at the body size: the sub-tab rail is now a
            // strip of icons, and the room it gave back goes to the figures.
            className="hidden w-[30rem] shrink-0 self-start xl:sticky xl:top-0 xl:block 2xl:w-[36rem] [&_td]:px-2 [&_th]:px-2"
          >
            <h2 className="mb-3 text-base font-semibold text-foreground">Montants</h2>
            <ProjectCostTable costs={summary?.costs} isLoading={summaryLoading} />
          </aside>
        )}
      </div>

      {!isClient && (
        <ClientQuickView clientId={project.clientId} open={viewingClient} onOpenChange={setViewingClient} />
      )}
      {savingTemplate && <SaveProjectTemplateDialog projectId={project.id} defaultName={project.description} onClose={() => setSavingTemplate(false)} />}
    </div>
  );
}

/**
 * What the crew needs on a job: who it is for and how to reach them, what is to be done and
 * when, and on the right the list of tasks. No figure that says what anything is worth.
 */
function CrewDetails({
  project,
  billing,
  site,
}: {
  project: NonNullable<ReturnType<typeof useProjectQuery>["data"]>;
  billing: string[];
  site: string[];
}) {
  const { data: tasks, isLoading } = useProjectTasksQuery(project.id);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Détails</h2>
          <p className="text-sm text-muted-foreground">Le client, le travail et les dates.</p>
        </div>
        <dl className="grid gap-4 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Client</dt>
            <dd className="font-medium text-foreground">{project.clientName}</dd>
          </div>
          {project.contactName && (
            <div>
              <dt className="text-muted-foreground">Contact</dt>
              <dd className="text-foreground">{project.contactName}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground">Début</dt>
            <dd className="text-foreground">{project.startDate ? formatDateOnly(project.startDate) : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Fin prévue</dt>
            <dd className="text-foreground">{project.endDate ? formatDateOnly(project.endDate) : "—"}</dd>
          </div>
          <AddressBlock label="Adresse des travaux" lines={site} />
          <AddressBlock label="Adresse du client" lines={billing} />
          {project.description && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Description</dt>
              <dd className="whitespace-pre-line text-foreground">{project.description}</dd>
            </div>
          )}
        </dl>
      </div>

      <aside aria-label="Tâches du projet">
        <h2 className="mb-3 text-base font-semibold text-foreground">Tâches</h2>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (tasks ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune tâche sur ce projet.</p>
        ) : (
          <ul className="grid gap-2">
            {(tasks ?? []).map((task) => (
              <li key={task.id}>
                <Link
                  href={`/projets/${project.id}/taches/${task.id}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-primary"
                >
                  <span className="min-w-0 truncate">{task.title}</span>
                  <Badge variant={taskStatusBadgeVariant[task.status]}>{taskStatusLabels[task.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

/** Keeps the job as a template: its tasks, materials, equipment, assemblies and extra charges. */
function SaveProjectTemplateDialog({
  projectId,
  defaultName,
  onClose,
}: {
  projectId: string;
  defaultName: string | null;
  onClose: () => void;
}) {
  const save = useSaveProjectAsTemplate();
  const [name, setName] = useState(defaultName?.split(/\r?\n/)[0]?.slice(0, 80) ?? "");

  async function submit() {
    try {
      const template = await save.mutateAsync({ projectId, name: name.trim() });
      toast.success(`Modèle « ${template.name} » enregistré.`, {
        description: "Choisissez-le dans « Partir d'un modèle » en créant un projet.",
      });
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer le modèle.");
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enregistrer comme modèle</DialogTitle>
          <DialogDescription>
            Les tâches, matériaux, équipements, assemblages et frais de ce projet sont gardés pour en
            créer d&apos;autres. Un nom déjà utilisé remplace ce modèle.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="project-template-name">Nom du modèle</FieldLabel>
          <Input id="project-template-name" value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
        </Field>
        <DialogFooter>
          <Button type="button" disabled={save.isPending || name.trim().length === 0} onClick={submit}>
            {save.isPending && <Spinner />}
            Enregistrer le modèle
          </Button>
          <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
