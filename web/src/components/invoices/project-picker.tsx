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
 * select leaked whenever its items had not loaded. The number is what identifies a project —
 * it is what the work order says — and the PO and the description are there to recognise it by.
 *
 * Without a client it offers every project the company has. That is what an order or a shift
 * needs: those are not written from a client's card, and asking for the client first would make
 * somebody look up who owns a job before they can point at it.
 */
export function ProjectPicker({
  clientId,
  value,
  onChange,
  id,
}: {
  /** Omitted to search every project rather than one client's. */
  clientId?: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
}) {
  // One page: a client with more than a hundred projects is not a case worth paging for here,
  // and the search below narrows what is shown anyway.
  const { data, isLoading } = useProjectsQuery(1, "", clientId || undefined);
  // Null while nothing has been typed, which is how the field can show the record it already
  // points at. A plain empty string would win over the selection and the form would open on a
  // placeholder where a chosen value belongs.
  const [typed, setTyped] = useState<string | null>(null);

  // An explicitly empty clientId means a client has to be chosen first and none has been;
  // undefined means the caller wants the whole company's projects.
  const projects = useMemo(
    () => (clientId === "" ? [] : (data?.items ?? [])),
    [clientId, data],
  );
  const selected = useMemo(
    () => projects.find((project) => project.id === value) ?? null,
    [projects, value],
  );

  const matches = useMemo(() => {
    const needle = (typed ?? "").trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) =>
      `${formatProjectNumber(project.number)} ${project.description ?? ""} ${project.poNumber ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [projects, typed]);

  return (
    <Combobox
      items={matches}
      value={selected}
      inputValue={typed ?? (selected ? formatProjectNumber(selected.number) : "")}
      onInputValueChange={setTyped}
      onValueChange={(next) => {
        const picked = next as ProjectRecord | null;
        onChange(picked?.id ?? "");
        setTyped(picked ? formatProjectNumber(picked.number) : "");
      }}
      itemToStringLabel={(project: ProjectRecord) => formatProjectNumber(project.number)}
      disabled={clientId === ""}
    >
      <div className="relative">
        <ComboboxInput
          id={id}
          placeholder={
            clientId === ""
              ? "Choisissez d'abord un client"
              : isLoading
                ? "Chargement…"
                : "Rechercher un projet…"
          }
        />
        <ComboboxTrigger />
      </div>

      <ComboboxContent>
        <ComboboxEmpty>Aucun projet ne correspond.</ComboboxEmpty>
        <ComboboxList>
          {(project: ProjectRecord) => (
            <ComboboxItem key={project.id} value={project}>
              <span className="truncate font-medium">{formatProjectNumber(project.number)}</span>
              <span className="truncate text-xs text-muted-foreground">
                {[project.poNumber ? `PO ${project.poNumber}` : null, project.description]
                  .filter(Boolean)
                  .join(" · ") || "Sans description"}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
