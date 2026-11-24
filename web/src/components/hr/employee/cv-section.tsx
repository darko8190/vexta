"use client";

import { useState } from "react";
import { FileUser, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { useCvQuery, useDeleteCvEntry, useSaveCvEntry } from "@/hooks/use-employee-file";
import { ApiError } from "@/lib/api";
import { cvEntryKindLabels } from "@/lib/labels";
import { formatDateOnly } from "@/lib/dates";
import { ex } from "@/lib/placeholders";
import type { CvEntryKind, EmployeeCvEntry } from "@/lib/types";
import { rowOpenClassName, rowOpenProps } from "@/components/layout/row-open";
import { cn } from "@/lib/utils";

const kinds = Object.keys(cvEntryKindLabels) as CvEntryKind[];

function CvSheet({
  employeeId,
  entry,
  open,
  onOpenChange,
}: {
  employeeId: string;
  entry?: EmployeeCvEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveCvEntry(employeeId);
  const isEditing = Boolean(entry);

  const [kind, setKind] = useState<CvEntryKind>(entry?.kind ?? "Experience");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [organization, setOrganization] = useState(entry?.organization ?? "");
  const [startOn, setStartOn] = useState(entry?.startOn ?? "");
  const [endOn, setEndOn] = useState(entry?.endOn ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");

  async function onSubmit() {
    if (!title.trim()) {
      toast.error("Le titre est obligatoire.");
      return;
    }

    try {
      await save.mutateAsync({
        id: entry?.id ?? null,
        values: {
          kind,
          title: title.trim(),
          organization: organization.trim() || null,
          startOn: startOn || null,
          endOn: endOn || null,
          description: description.trim() || null,
          sortOrder: entry?.sortOrder ?? 0,
        },
      });
      toast.success(isEditing ? "Entrée modifiée." : "Entrée ajoutée.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer cette entrée.");
    }
  }

  const isSkill = kind === "Competence";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier l'entrée" : "Nouvelle entrée"}</SheetTitle>
          <SheetDescription>
            Ce qui est tapé ici se cherche. Le CV en PDF se range dans Documents.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cv-kind">Type</FieldLabel>
              <Select value={kind} onValueChange={(value) => setKind((value ?? "Experience") as CvEntryKind)}>
                <SelectTrigger id="cv-kind" className="w-full">
                  <SelectValue>{(value: CvEntryKind) => cvEntryKindLabels[value]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {kinds.map((value) => (
                    <SelectItem key={value} value={value}>
                      {cvEntryKindLabels[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="cv-title">
                {isSkill ? "Compétence" : kind === "Formation" ? "Diplôme" : "Poste"}
              </FieldLabel>
              <Input
                id="cv-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={
                  isSkill ? ex("Soudure TIG") : kind === "Formation" ? ex("DEP en charpenterie") : ex("Contremaître")
                }
              />
            </Field>

            {!isSkill && (
              <>
                <Field>
                  <FieldLabel htmlFor="cv-organization">
                    {kind === "Formation" ? "École" : "Employeur"}
                  </FieldLabel>
                  <Input
                    id="cv-organization"
                    value={organization}
                    onChange={(event) => setOrganization(event.target.value)}
                    placeholder={kind === "Formation" ? ex("CFP de Québec") : ex("Construction Beaulieu")}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="cv-start">Début</FieldLabel>
                    <Input id="cv-start" type="date" value={startOn} onChange={(event) => setStartOn(event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="cv-end">Fin</FieldLabel>
                    <Input id="cv-end" type="date" value={endOn} onChange={(event) => setEndOn(event.target.value)} />
                    <FieldDescription>Laissez vide si c&apos;est toujours en cours.</FieldDescription>
                  </Field>
                </div>
              </>
            )}

            <Field>
              <FieldLabel htmlFor="cv-description">Description</FieldLabel>
              <Textarea
                id="cv-description"
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={ex("Coffrage et charpente sur des bâtiments de trois étages.")}
              />
            </Field>
          </FieldGroup>
        </div>

        <SheetFooter>
          <Button type="button" onClick={onSubmit} disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {isEditing ? "Enregistrer" : "Ajouter"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * What this person has done before, typed in rather than read out of a PDF.
 *
 * The uploaded résumé lives in Documents; these rows are what can be searched the day somebody
 * asks who has already done this kind of work.
 */
export function CvSection({ employeeId }: { employeeId: string }) {
  const { data, isLoading, isError, error, refetch } = useCvQuery(employeeId);
  const remove = useDeleteCvEntry();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeCvEntry | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeCvEntry | undefined>(undefined);

  const sheetKey = `${editing?.id ?? "nouvelle"}-${open}`;

  async function confirmDelete() {
    if (!deleteTarget) return;

    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Entrée retirée.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de retirer cette entrée.");
    }
  }

  const addButton = (
    <Button
      onClick={() => {
        setEditing(undefined);
        setOpen(true);
      }}
    >
      <Plus />
      Ajouter
    </Button>
  );

  const items = data ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">CV</h2>
          <p className="text-sm text-muted-foreground">
            Le parcours et les compétences, saisis pour pouvoir être cherchés.
          </p>
        </div>
        {addButton}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="CV indisponible"
          fallback="Le parcours de cette personne n'a pas pu être chargé."
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileUser}
          title="Aucune entrée"
          description="Ajoutez une expérience, une formation ou une compétence. C'est ce qui rend quelqu'un trouvable quand un chantier demande un savoir-faire précis."
          action={addButton}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((entry) => (
            <li
              key={entry.id}
              {...rowOpenProps(() => { setEditing(entry); setOpen(true); }, "Ouvrir la fiche")}
              className={cn("flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3", rowOpenClassName)}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{entry.title}</span>
                  <Badge variant="secondary">{cvEntryKindLabels[entry.kind]}</Badge>
                </div>

                <p className="mt-0.5 text-sm text-muted-foreground">
                  {[
                    entry.organization,
                    entry.startOn
                      ? `${formatDateOnly(entry.startOn)} → ${entry.endOn ? formatDateOnly(entry.endOn) : "aujourd'hui"}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>

                {entry.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
                )}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon" className="shrink-0" aria-label="Actions sur cette entrée">
                      <MoreHorizontal />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(entry);
                      setOpen(true);
                    }}
                  >
                    <Pencil />
                    Modifier
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(entry)}>
                    <Trash2 />
                    Retirer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <CvSheet key={sheetKey} employeeId={employeeId} entry={editing} open={open} onOpenChange={setOpen} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => !next && setDeleteTarget(undefined)}
        title="Retirer cette entrée ?"
        description={`${deleteTarget?.title ?? ""} sera retirée du parcours.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
