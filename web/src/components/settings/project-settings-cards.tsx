"use client";

import { useState } from "react";
import { Clock, ListTree, Plus, Signal, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import {
  useDeleteAutoLine,
  useDeleteNamedItem,
  useProjectSettingsQuery,
  useSaveAutoLine,
  useSaveLabourMode,
  useSaveNamedItem,
  type NamedList,
} from "@/hooks/use-project-settings";
import { ApiError } from "@/lib/api";
import type {
  AutoLineEvent,
  AutoLineSection,
  LabourEntryMode,
  NamedItem,
  ProjectAutoLine,
  ProjectAutoLineValues,
} from "@/lib/types";
import { cn } from "@/lib/utils";

function errorText(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

const modes: { mode: LabourEntryMode; title: string; meaning: string }[] = [
  {
    mode: "Manuel",
    title: "Saisie manuelle",
    meaning: "L'employé entre l'heure de début, l'heure de fin, la date et une note, comme sur une feuille de temps.",
  },
  {
    mode: "Punch",
    title: "Punch",
    meaning: "L'employé appuie sur Commencer, Mettre en pause, Continuer et Terminer. Les heures se calculent seules.",
  },
];

/** How the crew records its hours on a job: typed in, or punched. */
export function LabourModeCard() {
  const { data, isLoading } = useProjectSettingsQuery();
  const save = useSaveLabourMode();

  async function choose(mode: LabourEntryMode) {
    if (mode === data?.labourMode) return;
    try {
      await save.mutateAsync(mode);
      toast.success(mode === "Punch" ? "Main-d'œuvre en mode punch." : "Main-d'œuvre en saisie manuelle.");
    } catch (error) {
      toast.error(errorText(error, "Impossible d'enregistrer ce choix."));
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="size-4" />
          Main-d&apos;œuvre
        </CardTitle>
        <CardDescription>Comment les employés entrent leurs heures sur un projet ou une tâche.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <div role="radiogroup" aria-label="Type de main-d'œuvre" className="grid gap-2 sm:grid-cols-2">
            {modes.map((option) => {
              const selected = data?.labourMode === option.mode;
              return (
                <button
                  key={option.mode}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={save.isPending}
                  onClick={() => void choose(option.mode)}
                  className={cn(
                    "flex h-full flex-col gap-1.5 rounded-lg border px-3 py-3 text-left transition-colors",
                    "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                  )}
                >
                  <span className="text-sm font-medium text-foreground">{option.title}</span>
                  <span className="text-sm text-muted-foreground">{option.meaning}</span>
                </button>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-sm text-muted-foreground">
          En mode punch, le bureau peut toujours ajouter ou corriger une ligne à la main.
        </p>
      </CardContent>
    </Card>
  );
}

const lists: Record<NamedList, { title: string; description: string; placeholder: string; add: string; empty: string; icon: typeof ListTree; deleteNote: string }> = {
  types: {
    title: "Types de tâche",
    description: "Les sortes de tâches que vous faites. Une tâche choisit son type, et les lignes automatiques peuvent en dépendre.",
    placeholder: "Inspection",
    add: "Ajouter un type",
    empty: "Aucun type de tâche pour l'instant.",
    icon: ListTree,
    deleteNote: "Les tâches de ce type n'auront plus de type, et les lignes automatiques liées à ce type seront retirées.",
  },
  priorites: {
    title: "Priorités des projets",
    description: "Les priorités qu'un projet peut avoir. Basse, Moyenne et Haute sont là au départ.",
    placeholder: "Urgente",
    add: "Ajouter une priorité",
    empty: "Aucune priorité pour l'instant.",
    icon: Signal,
    deleteNote: "Les projets qui l'avaient n'auront plus de priorité.",
  },
};

/** A plain list of names: the task types, or the project priorities. Renamed in place. */
export function NamedListCard({ list }: { list: NamedList }) {
  const meta = lists[list];
  const Icon = meta.icon;
  const { data, isLoading } = useProjectSettingsQuery();
  const save = useSaveNamedItem(list);
  const remove = useDeleteNamedItem(list);
  const [draft, setDraft] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<NamedItem | null>(null);

  const items = (list === "types" ? data?.taskTypes : data?.priorities) ?? [];

  async function commit(id: string | undefined, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (id && items.find((item) => item.id === id)?.name === trimmed) return;
    try {
      await save.mutateAsync({ id, name: trimmed });
      if (!id) setDraft(null);
    } catch (error) {
      toast.error(errorText(error, "Impossible d'enregistrer ce nom."));
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success("Retiré.");
      setDeleting(null);
    } catch (error) {
      toast.error(errorText(error, "Impossible de retirer cet élément."));
    }
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4" />
          {meta.title}
        </CardTitle>
        <CardDescription>{meta.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <>
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <Input
                  aria-label={`Nom : ${item.name}`}
                  maxLength={100}
                  value={names[item.id] ?? item.name}
                  onChange={(event) => setNames((previous) => ({ ...previous, [item.id]: event.target.value }))}
                  onBlur={(event) => void commit(item.id, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
                <Button variant="ghost" size="icon" aria-label={`Retirer ${item.name}`} onClick={() => setDeleting(item)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            {draft !== null && (
              <div className="flex items-center gap-2">
                <Input
                  autoFocus
                  aria-label="Nouveau nom"
                  maxLength={100}
                  placeholder={meta.placeholder}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={(event) => void commit(undefined, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") setDraft(null);
                  }}
                />
                <Button variant="ghost" size="icon" aria-label="Annuler l'ajout" onClick={() => setDraft(null)}>
                  <Trash2 />
                </Button>
              </div>
            )}
            {items.length === 0 && draft === null && <p className="text-sm text-muted-foreground">{meta.empty}</p>}
            <Button variant="outline" className="mt-2" onClick={() => setDraft("")} disabled={draft !== null}>
              <Plus />
              {meta.add}
            </Button>
          </>
        )}
      </CardContent>

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Retirer « ${deleting?.name ?? ""} » ?`}
        description={meta.deleteNote}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </Card>
  );
}

const eventLabels: Record<AutoLineEvent, string> = {
  ProjetCree: "Création d'un projet",
  TacheCreee: "Création d'une tâche",
};

export const autoLineSectionLabels: Record<AutoLineSection, string> = {
  MainDoeuvre: "Main-d'œuvre",
  Materiaux: "Matériaux",
  Equipements: "Équipements",
  FraisSupplementaires: "Frais supplémentaires",
};

const sections: AutoLineSection[] = ["MainDoeuvre", "Materiaux", "Equipements", "FraisSupplementaires"];
const ANY_TYPE = "tous";

const blankLine: ProjectAutoLineValues = {
  event: "ProjetCree",
  taskTypeId: null,
  section: "FraisSupplementaires",
  description: "",
  quantity: 1,
  unitCost: null,
  unitPrice: 0,
  isActive: true,
};

const valuesOfLine = (line: ProjectAutoLine): ProjectAutoLineValues => ({
  event: line.event,
  taskTypeId: line.taskTypeId,
  section: line.section,
  description: line.description,
  quantity: line.quantity,
  unitCost: line.unitCost,
  unitPrice: line.unitPrice,
  isActive: line.isActive,
});

/**
 * Lines added on their own when something happens: an event (a project is created, a task of a
 * given type is created) puts a line in one section of the project.
 */
export function AutoLinesCard() {
  const { data, isLoading } = useProjectSettingsQuery();
  const save = useSaveAutoLine();
  const remove = useDeleteAutoLine();
  const [edits, setEdits] = useState<Record<string, ProjectAutoLineValues>>({});
  const [draft, setDraft] = useState<ProjectAutoLineValues | null>(null);
  const [deleting, setDeleting] = useState<ProjectAutoLine | null>(null);

  const linesList = data?.autoLines ?? [];
  const taskTypes = data?.taskTypes ?? [];

  async function commit(id: string | undefined, values: ProjectAutoLineValues) {
    if (!values.description.trim() || values.quantity <= 0) return;
    if (id) {
      const saved = linesList.find((line) => line.id === id);
      if (saved && JSON.stringify(valuesOfLine(saved)) === JSON.stringify(values)) return;
    }
    try {
      await save.mutateAsync({ id, values });
      if (!id) {
        setDraft(null);
        toast.success("Ligne automatique ajoutée.");
      }
    } catch (error) {
      toast.error(errorText(error, "Impossible d'enregistrer cette ligne."));
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success("Ligne automatique retirée.");
      setDeleting(null);
    } catch (error) {
      toast.error(errorText(error, "Impossible de retirer cette ligne."));
    }
  }

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="size-4" />
          Lignes automatiques
        </CardTitle>
        <CardDescription>
          Quand un événement arrive, une ligne est ajoutée d&apos;elle-même dans la section choisie du projet. Pour la
          main-d&apos;œuvre, la quantité est un nombre d&apos;heures et le prix est le taux horaire (0 prend le taux de
          l&apos;entreprise).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            {linesList.map((line) => (
              <AutoLineRow
                key={line.id}
                values={edits[line.id] ?? valuesOfLine(line)}
                taskTypes={taskTypes}
                onChange={(next) => setEdits((previous) => ({ ...previous, [line.id]: next }))}
                onCommit={(next) => void commit(line.id, next)}
                onRemove={() => setDeleting(line)}
              />
            ))}
            {draft && (
              <AutoLineRow
                values={draft}
                taskTypes={taskTypes}
                onChange={setDraft}
                onCommit={(next) => void commit(undefined, next)}
                onRemove={() => setDraft(null)}
              />
            )}
            {linesList.length === 0 && !draft && (
              <p className="text-sm text-muted-foreground">Aucune ligne automatique : les projets commencent vides.</p>
            )}
            <Button variant="outline" onClick={() => setDraft({ ...blankLine })} disabled={Boolean(draft)}>
              <Plus />
              Ajouter une ligne automatique
            </Button>
          </>
        )}
      </CardContent>

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Retirer cette ligne automatique ?"
        description={`« ${deleting?.description ?? ""} » ne sera plus ajoutée. Les projets déjà créés ne changent pas.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </Card>
  );
}

/** One rule, edited in place: when, where, and what line. */
function AutoLineRow({
  values,
  taskTypes,
  onChange,
  onCommit,
  onRemove,
}: {
  values: ProjectAutoLineValues;
  taskTypes: NamedItem[];
  onChange: (next: ProjectAutoLineValues) => void;
  onCommit: (next: ProjectAutoLineValues) => void;
  onRemove: () => void;
}) {
  const labour = values.section === "MainDoeuvre";
  const change = (next: ProjectAutoLineValues) => {
    onChange(next);
    onCommit(next);
  };

  return (
    <div className="grid gap-3 rounded-lg border border-border p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Événement</span>
          <Select
            value={values.event}
            onValueChange={(value) =>
              change({ ...values, event: (value ?? "ProjetCree") as AutoLineEvent, taskTypeId: null })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue>{(value: AutoLineEvent) => eventLabels[value]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(eventLabels) as AutoLineEvent[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {eventLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {values.event === "TacheCreee" ? (
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Type de tâche</span>
            <Select
              value={values.taskTypeId ?? ANY_TYPE}
              onValueChange={(value) => change({ ...values, taskTypeId: !value || value === ANY_TYPE ? null : value })}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value: string) =>
                    value === ANY_TYPE ? "Tous les types" : (taskTypes.find((type) => type.id === value)?.name ?? "Tous les types")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_TYPE}>Tous les types</SelectItem>
                {taskTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : (
          <div className="hidden sm:block" />
        )}

        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Section</span>
          <Select
            value={values.section}
            onValueChange={(value) => change({ ...values, section: (value ?? "FraisSupplementaires") as AutoLineSection })}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{(value: AutoLineSection) => autoLineSectionLabels[value]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {sections.map((key) => (
                <SelectItem key={key} value={key}>
                  {autoLineSectionLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_90px_110px_110px_auto_auto]">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Description</span>
          <Input
            maxLength={500}
            placeholder={labour ? "Inspection" : "Frais de déplacement"}
            value={values.description}
            onChange={(event) => onChange({ ...values, description: event.target.value })}
            onBlur={() => onCommit(values)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{labour ? "Heures" : "Quantité"}</span>
          <Input
            type="number"
            min="0"
            step="0.25"
            className="text-right tabular-nums"
            value={values.quantity}
            onChange={(event) => onChange({ ...values, quantity: event.target.valueAsNumber || 0 })}
            onBlur={() => onCommit(values)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Coût</span>
          <Input
            type="number"
            min="0"
            step="0.01"
            className="text-right tabular-nums"
            disabled={labour}
            value={labour ? "" : (values.unitCost ?? "")}
            placeholder={labour ? "—" : ""}
            onChange={(event) =>
              onChange({ ...values, unitCost: event.target.value === "" ? null : event.target.valueAsNumber })
            }
            onBlur={() => onCommit(values)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{labour ? "Taux ($/h)" : "Vendant"}</span>
          <Input
            type="number"
            min="0"
            step="0.01"
            className="text-right tabular-nums"
            value={values.unitPrice}
            onChange={(event) => onChange({ ...values, unitPrice: event.target.valueAsNumber || 0 })}
            onBlur={() => onCommit(values)}
          />
        </label>
        <label className="flex h-9 items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox checked={values.isActive} onCheckedChange={(checked) => change({ ...values, isActive: checked === true })} />
          Active
        </label>
        <Button variant="ghost" size="icon" aria-label="Retirer cette ligne" onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}
