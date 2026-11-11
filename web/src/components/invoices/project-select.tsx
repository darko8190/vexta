"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjectsQuery } from "@/hooks/use-projects";

export function ProjectSelect({
  clientId,
  value,
  onChange,
  id,
}: {
  clientId: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
}) {
  const { data, isLoading } = useProjectsQuery(1, "", clientId || undefined);
  const projects = data?.items ?? [];

  return (
    <Select
      value={value || "none"}
      onValueChange={(v) => onChange(!v || v === "none" ? "" : v)}
      disabled={!clientId}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={!clientId ? "Choisir un client d'abord" : isLoading ? "Chargement…" : "Aucun projet"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Aucun projet</SelectItem>
        {projects.map((projectItem) => (
          <SelectItem key={projectItem.id} value={projectItem.id}>
            {projectItem.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
