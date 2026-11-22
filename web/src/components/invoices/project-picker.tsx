"use client";

import { useMemo, useState } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { useProjectsQuery } from "@/hooks/use-projects";
import { formatProjectNumber, type ProjectRecord } from "@/lib/types";

/**
 * Picks one of the client's projects by typing, and shows P-0007 rather than the GUID the old
 * select leaked whenever its items had not loaded. The number is searchable because that is
 * what people have in front of them — a work order, not a name they would have to spell.
 */
export function ProjectPicker({
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
  // One page: a client with more than a hundred projects is not a case worth paging for here,
  // and the search below narrows what is shown anyway.
  const { data, isLoading } = useProjectsQuery(1, "", clientId || undefined);
  const [query, setQuery] = useState("");

  const projects = useMemo(() => (clientId ? (data?.items ?? []) : []), [clientId, data]);
  const selected = useMemo(
    () => projects.find((project) => project.id === value) ?? null,
    [projects, value],
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) =>
      `${formatProjectNumber(project.number)} ${project.name} ${project.poNumber ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [projects, query]);

  return (
    <Combobox
      items={matches}
      value={selected}
      inputValue={query}
      onInputValueChange={setQuery}
      onValueChange={(next) => {
        const picked = next as ProjectRecord | null;
        onChange(picked?.id ?? "");
        setQuery(picked?.name ?? "");
      }}
      itemToStringLabel={(project: ProjectRecord) => project.name}
      disabled={!clientId}
    >
      <div className="relative">
        <ComboboxInput
          id={id}
          placeholder={
            !clientId ? "Choisissez d'abord un client" : isLoading ? "Chargement…" : "Aucun projet"
          }
        />
        <ComboboxTrigger />
      </div>

      <ComboboxContent>
        <ComboboxEmpty>Aucun projet ne correspond.</ComboboxEmpty>
        <ComboboxList>
          {(project: ProjectRecord) => (
            <ComboboxItem key={project.id} value={project}>
              <span className="truncate font-medium">{project.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {formatProjectNumber(project.number)}
                {project.poNumber ? ` · PO ${project.poNumber}` : ""}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
