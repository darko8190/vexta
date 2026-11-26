"use client";

import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { storedValues } from "@/components/projects/project-form-sheet";
import { useUpdateProject } from "@/hooks/use-projects";
import { ApiError } from "@/lib/api";
import { projectStatusLabels } from "@/lib/labels";
import type { ProjectRecord, ProjectStatus } from "@/lib/types";

const statuses = Object.keys(projectStatusLabels) as ProjectStatus[];

/**
 * The project's state, changed from the top of its page in one move. Sends the rest of the
 * record back as stored, so moving the state never carries along an edit half-typed in the
 * form below.
 */
export function ProjectStatusSelect({ project }: { project: ProjectRecord }) {
  const update = useUpdateProject();

  async function change(next: ProjectStatus) {
    if (next === project.status) return;
    try {
      await update.mutateAsync({ id: project.id, values: { ...storedValues(project), status: next } });
      toast.success(`Projet ${projectStatusLabels[next].toLowerCase()}.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de changer l'état du projet.");
    }
  }

  return (
    <Select value={project.status} onValueChange={(value) => value && void change(value as ProjectStatus)}>
      <SelectTrigger size="sm" aria-label="État du projet" className="min-w-36" disabled={update.isPending}>
        {update.isPending && <Spinner />}
        <SelectValue>{(status: ProjectStatus) => projectStatusLabels[status]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {statuses.map((status) => (
          <SelectItem key={status} value={status}>
            {projectStatusLabels[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
