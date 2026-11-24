"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Car, FolderKanban, Info, ListChecks, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { InlineSheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { rowOpenClassName, rowOpenProps } from "@/components/layout/row-open";
import { AssetFormSheet } from "@/components/clients/detail/asset-form-sheet";
import { ProjectFormSheet } from "@/components/projects/project-form-sheet";
import { useCanCreate } from "@/hooks/use-can-create";
import { useAssetTasksQuery, useClientAssetQuery } from "@/hooks/use-client-assets";
import { useClientQuery } from "@/hooks/use-clients";
import { useProjectsQuery } from "@/hooks/use-projects";
import { formatDateOnly } from "@/lib/dates";
import {
  projectStatusLabels,
  taskStatusBadgeVariant,
  taskStatusLabels,
} from "@/lib/labels";
import { formatProjectNumber } from "@/lib/types";
import { cn } from "@/lib/utils";

function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

function Rows() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}

/** The jobs done on this asset. A new one opens with the client and the asset already chosen. */
function AssetProjects({ clientId, assetId }: { clientId: string; assetId: string }) {
  const router = useRouter();
  const canCreate = useCanCreate();
  const [formOpen, setFormOpen] = useState(false);
  const { data, isLoading, isError, error, refetch } = useProjectsQuery(
    1,
    "",
    clientId,
    undefined,
    assetId,
  );
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
        description="Les travaux faits ou en cours sur cet actif."
        action={addButton}
      />
      {isLoading ? (
        <Rows />
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Projets indisponibles"
          fallback="Les projets de cet actif n'ont pas pu être chargés."
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Aucun projet"
          description="Aucun travail n'a encore été fait sur cet actif."
          action={addButton}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((project) => (
            <li
              key={project.id}
              {...rowOpenProps(
                () => router.push(`/projets/${project.id}`),
                `Ouvrir le projet ${formatProjectNumber(project.number)}`,
              )}
              className={cn(
                "flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3",
                rowOpenClassName,
              )}
            >
              <div className="min-w-0">
                <span className="font-mono text-sm font-medium text-foreground">
                  {formatProjectNumber(project.number)}
                </span>
                {project.startDate && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatDateOnly(project.startDate)}
                  </span>
                )}
                {project.description && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                    {project.description}
                  </p>
                )}
              </div>
              <Badge variant="secondary" className="shrink-0">
                {projectStatusLabels[project.status]}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <ProjectFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        defaultClientId={clientId}
        defaultClientAssetId={assetId}
      />
    </div>
  );
}

/** Every task of every job on this asset, grouped by nothing but the job number beside it. */
function AssetTasks({ clientId, assetId }: { clientId: string; assetId: string }) {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useAssetTasksQuery(clientId, assetId);
  const tasks = data ?? [];

  return (
    <div>
      <SectionHeading
        title="Tâches"
        description="Les tâches de tous les projets faits sur cet actif."
      />
      {isLoading ? (
        <Rows />
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Tâches indisponibles"
          fallback="Les tâches de cet actif n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Aucune tâche"
          description="Les tâches ajoutées aux projets de cet actif apparaîtront ici."
        />
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              {...rowOpenProps(
                () => router.push(`/projets/${task.projectId}`),
                `Ouvrir le projet de la tâche ${task.title}`,
              )}
              className={cn(
                "flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3",
                rowOpenClassName,
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-mono">{formatProjectNumber(task.projectNumber)}</span>
                  {task.dueDate && <> · Échéance {formatDateOnly(task.dueDate)}</>}
                  {task.isLate && <span className="ml-1 text-destructive">· En retard</span>}
                </p>
              </div>
              <Badge variant={taskStatusBadgeVariant[task.status]} className="shrink-0">
                {taskStatusLabels[task.status]}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One asset's own file, shaped like a client's: who it belongs to and what it is on a card,
 * then a rail — its details, editable in place, the jobs done on it, and their tasks.
 */
export default function ClientAssetPage({
  params,
}: {
  params: Promise<{ id: string; assetId: string }>;
}) {
  const { id: clientId, assetId } = use(params);
  const { data: asset, isLoading, isError } = useClientAssetQuery(clientId, assetId);
  const { data: client } = useClientQuery(clientId);
  const [section, setSection] = useState("details");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !asset) {
    return (
      <EmptyState
        icon={Car}
        title="Actif introuvable"
        description="Cet actif n'existe plus, ou vous n'y avez pas accès."
        action={
          <Link href={`/clients/${clientId}`} className={cn(buttonVariants())}>
            Retour au client
          </Link>
        }
      />
    );
  }

  const sections: NavSection[] = [
    { key: "details", label: "Détails", icon: Info },
    { key: "projets", label: "Projets", icon: FolderKanban },
    { key: "taches", label: "Tâches", icon: ListChecks },
  ];

  return (
    <div>
      <Link
        href={`/clients/${clientId}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {client?.name ?? "Client"}
      </Link>

      <div className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          {asset.assetTypeName && <Badge variant="secondary">{asset.assetTypeName}</Badge>}
          {!asset.isActive && <Badge variant="outline">Hors service</Badge>}
        </div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {asset.label}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {[
            asset.designation !== asset.label ? asset.designation : null,
            asset.serialNumber ? `Série ${asset.serialNumber}` : null,
            asset.reference,
          ]
            .filter(Boolean)
            .join(" · ") || (client ? `Actif de ${client.name}` : "")}
        </p>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav
          sections={sections}
          active={section}
          onSelect={setSection}
          label="Sections de l'actif"
        />

        <div className="min-w-0 flex-1">
          {section === "details" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">Détails</h2>
                <p className="text-sm text-muted-foreground">
                  Modifiez les champs directement, puis enregistrez.
                </p>
              </div>
              <InlineSheet>
                <AssetFormSheet
                  open
                  onOpenChange={() => {}}
                  clientId={clientId}
                  asset={asset}
                />
              </InlineSheet>
            </div>
          )}
          {section === "projets" && <AssetProjects clientId={clientId} assetId={asset.id} />}
          {section === "taches" && <AssetTasks clientId={clientId} assetId={asset.id} />}
        </div>
      </div>
    </div>
  );
}
