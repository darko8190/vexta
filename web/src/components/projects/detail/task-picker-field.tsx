"use client";

import { ListChecks } from "lucide-react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjectTasksQuery } from "@/hooks/use-project-tasks";
import { taskStatusLabels } from "@/lib/labels";

/** The value the select uses for "no task". An empty string closes a Select on some browsers. */
const NONE = "__aucune__";

/**
 * Attaching a line of a job — hours, a material, an expense, an extra charge — to one of its
 * tasks.
 *
 * One component for all four forms, because the question is the same in all four and the answer
 * has to be optional in all four. Most lines belong to the job rather than to a named task, and
 * a required choice here would get a made-up one — which would be worse than leaving it empty,
 * since a task's total would then be wrong rather than merely incomplete.
 *
 * Shows nothing at all when the project has no tasks. An empty dropdown is a question with no
 * possible answer, and the forms were perfectly usable before this existed.
 */
export function TaskPickerField({
  projectId,
  value,
  onChange,
  id = "task-picker",
  compact,
}: {
  projectId: string;
  value: string | null;
  onChange: (taskId: string | null) => void;
  id?: string;
  /**
   * For the materials table, where this sits inside a column rather than under a form. The
   * label goes to screen readers only above lg — the heading row already names the column — and
   * the explanatory line is dropped: a sentence under every line of a table is noise.
   */
  compact?: boolean;
}) {
  const { data: tasks } = useProjectTasksQuery(projectId);

  if (!tasks || tasks.length === 0) return null;

  // The one already chosen is kept in the list even when it is finished, so editing an old line
  // does not silently drop the task it was filed under.
  const chosen = tasks.find((task) => task.id === value);

  return (
    <Field>
      <FieldLabel htmlFor={id} className={compact ? "lg:sr-only" : undefined}>
        {!compact && <ListChecks className="size-4" />}
        Tâche
      </FieldLabel>
      <Select value={value ?? NONE} onValueChange={(next) => onChange(next === NONE ? null : next)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue>
            {chosen ? chosen.title : compact ? "Aucune" : "Aucune — sur le projet"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Aucune — sur le projet</SelectItem>
          {tasks.map((task) => (
            <SelectItem key={task.id} value={task.id}>
              {task.title}
              <span className="text-muted-foreground">
                {" · "}
                {taskStatusLabels[task.status]}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!compact && (
        <FieldDescription>
          Optionnel. Ce qui est attribué apparaît dans le coût par tâche.
        </FieldDescription>
      )}
    </Field>
  );
}
