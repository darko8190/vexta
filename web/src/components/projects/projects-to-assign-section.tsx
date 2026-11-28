"use client";

import { useState } from "react";
import Link from "next/link";
import { FolderKanban, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { api, ApiError } from "@/lib/api";
import { formatDateOnly } from "@/lib/dates";
import { projectStatusBadgeVariant, projectStatusLabels } from "@/lib/labels";
import { formatProjectNumber, type ProjectStatus, type TaskAssignables } from "@/lib/types";

interface ProjectToAssign {
  id: string;
  number: number;
  clientName: string;
  description: string | null;
  status: ProjectStatus;
  startDate: string | null;
  priorityName: string | null;
  openTasks: number;
}

const KEY = ["projects", "a-assigner"];
const NO_TEAM = "aucune";

/**
 * The jobs waiting for a crew: À faire or Commencé, and no open task handed to anyone. Assigning
 * one gives its open tasks to the people chosen — or a « Travaux » task when it has none.
 */
/** The projects waiting for a crew; also what counts the sub-tab's badge. */
export function useProjectsToAssignQuery(enabled = true) {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<ProjectToAssign[]>("projects/a-assigner"),
    enabled,
  });
}

export function ProjectsToAssignSection() {
  const { data, isLoading, isError, error, refetch } = useProjectsToAssignQuery();
  const [assigning, setAssigning] = useState<ProjectToAssign | null>(null);
  const projects = data ?? [];

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Projets à assigner</h2>
        <p className="text-sm text-muted-foreground">
          Les projets à faire ou commencés dont aucune tâche ouverte n&apos;est confiée à quelqu&apos;un.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Projets indisponibles"
          fallback="Les projets à assigner n'ont pas pu être chargés."
          onRetry={() => refetch()}
        />
      ) : projects.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={FolderKanban}
            title="Tout est assigné"
            description="Chaque projet ouvert a au moins une tâche confiée à une équipe ou à une personne."
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Projet</TableHead>
                <TableHead>Début</TableHead>
                <TableHead>État</TableHead>
                <TableHead className="text-right">Tâches ouvertes</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell>
                    <Link href={`/projets/${project.id}`} className="underline-offset-4 hover:underline">
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatProjectNumber(project.number)}
                      </span>{" "}
                      <span className="font-medium text-foreground">{project.clientName}</span>
                    </Link>
                    {project.description && (
                      <p className="line-clamp-1 max-w-80 text-xs text-muted-foreground">{project.description}</p>
                    )}
                    {project.priorityName && (
                      <Badge variant="outline" className="mt-1">
                        Priorité {project.priorityName.toLowerCase()}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {project.startDate ? formatDateOnly(project.startDate) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={projectStatusBadgeVariant[project.status]}>{projectStatusLabels[project.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{project.openTasks}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => setAssigning(project)}>
                      <UserPlus />
                      Assigner
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {assigning && <AssignDialog project={assigning} onClose={() => setAssigning(null)} />}
    </div>
  );
}

/** A crew, named people, or both, for every open task of the job that has nobody. */
function AssignDialog({ project, onClose }: { project: ProjectToAssign; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: assignables, isLoading } = useQuery({
    queryKey: ["taches", "assignables"],
    queryFn: () => api.get<TaskAssignables>("taches/assignables"),
    staleTime: 5 * 60 * 1000,
  });
  const [teamId, setTeamId] = useState("");
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const assign = useMutation({
    mutationFn: () =>
      api.post(`projects/${project.id}/assigner`, { teamId: teamId || null, employeeIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ["projects", project.id] });
      queryClient.invalidateQueries({ queryKey: ["travail"] });
    },
  });

  async function submit() {
    try {
      await assign.mutateAsync();
      toast.success(`Projet ${formatProjectNumber(project.number)} assigné.`);
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'assigner ce projet.");
    }
  }

  const teams = assignables?.teams ?? [];
  const employees = assignables?.employees ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assigner {formatProjectNumber(project.number)}</DialogTitle>
          <DialogDescription>
            {project.openTasks > 0
              ? "Les tâches ouvertes de ce projet iront à l'équipe et aux employés choisis."
              : "Le projet n'a aucune tâche ouverte : une tâche « Travaux » sera créée pour l'équipe et les employés choisis."}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="mx-4 h-32" />
        ) : (
          <div className="space-y-4 px-4">
            <Field>
              <FieldLabel htmlFor="assign-team">Équipe</FieldLabel>
              <Select value={teamId || NO_TEAM} onValueChange={(value) => setTeamId(!value || value === NO_TEAM ? "" : value)}>
                <SelectTrigger id="assign-team" className="w-full">
                  <SelectValue>
                    {(value: string) =>
                      !value || value === NO_TEAM ? "Aucune" : (teams.find((team) => team.id === value)?.name ?? "Aucune")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEAM}>Aucune</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name} ({team.memberCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Employés</FieldLabel>
              {employees.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun employé au dossier.</p>
              ) : (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
                  {employees.map((employee) => (
                    <label
                      key={employee.id}
                      className="flex items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0"
                    >
                      <Checkbox
                        checked={employeeIds.includes(employee.id)}
                        onCheckedChange={(checked) =>
                          setEmployeeIds((previous) =>
                            checked === true ? [...previous, employee.id] : previous.filter((id) => id !== employee.id),
                          )
                        }
                      />
                      <span className="min-w-0 truncate">{employee.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </Field>
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={assign.isPending || (!teamId && employeeIds.length === 0)}>
            {assign.isPending && <Spinner />}
            Assigner le projet
          </Button>
          <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
