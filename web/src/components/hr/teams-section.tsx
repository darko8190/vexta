"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { MoreHorizontal, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { LoadErrorState } from "@/components/layout/load-error-state";
import { EmptyState } from "@/components/layout/empty-state";
import { useDeleteTeam, useSaveTeam, useTeamsQuery } from "@/hooks/use-hr";
import { useTeamQuery } from "@/hooks/use-team";
import { ApiError } from "@/lib/api";
import type { TeamRecord } from "@/lib/types";
import { ex } from "@/lib/placeholders";

const NO_LEAD = "aucun";

const formSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis.").max(100, "100 caractères maximum."),
  description: z.string().trim().max(500, "500 caractères maximum."),
  leadEmployeeId: z.string(),
  memberIds: z.array(z.string()).min(1, "Choisissez au moins un membre."),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(team?: TeamRecord): FormValues {
  return {
    name: team?.name ?? "",
    description: team?.description ?? "",
    leadEmployeeId: team?.leadEmployeeId ?? NO_LEAD,
    memberIds: team?.members.map((m) => m.id) ?? [],
  };
}

function TeamFormSheet({
  open,
  onOpenChange,
  team,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team?: TeamRecord;
}) {
  const isEditing = Boolean(team);
  const save = useSaveTeam();
  const { data: staff } = useTeamQuery();
  const employees = staff?.employees ?? [];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(team),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(team));
  }, [open, team, form]);

  // useWatch, not form.watch: the React Compiler lint rejects the latter inside render, and the
  // lead list has to follow the membership as it is ticked.
  const watchedMembers = useWatch({ control: form.control, name: "memberIds" }) ?? [];

  async function onSubmit(values: FormValues) {
    try {
      await save.mutateAsync({
        id: team?.id,
        values: {
          name: values.name,
          description: values.description || null,
          leadEmployeeId: values.leadEmployeeId === NO_LEAD ? null : values.leadEmployeeId,
          memberIds: values.memberIds,
        },
      });
      toast.success(isEditing ? "Équipe mise à jour." : "Équipe créée.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer cette équipe.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier l'équipe" : "Nouvelle équipe"}</SheetTitle>
          <SheetDescription>
            Un groupe d&apos;employés. Une personne peut appartenir à plusieurs équipes.
          </SheetDescription>
        </SheetHeader>

        <form
          id="team-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="team-name">Nom</FieldLabel>
                  <Input {...field} id="team-name" placeholder={ex("Toiture")} aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="team-description">Description</FieldLabel>
                  <Textarea {...field} id="team-description" rows={2} aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="memberIds"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Membres</FieldLabel>
                  {employees.length === 0 ? (
                    <FieldDescription>
                      Aucun employé n&apos;existe encore. Ajoutez-en dans Employés pour composer une équipe.
                    </FieldDescription>
                  ) : (
                    <div className="space-y-2">
                      {employees.map((employee) => {
                        const checked = field.value.includes(employee.id);
                        return (
                          <label
                            key={employee.id}
                            className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-muted/40"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(next) => {
                                const members =
                                  next === true
                                    ? [...field.value, employee.id]
                                    : field.value.filter((id: string) => id !== employee.id);
                                field.onChange(members);
                                // A lead who is no longer a member would be refused by the API,
                                // so clearing it here beats a save that bounces back.
                                if (next !== true && form.getValues("leadEmployeeId") === employee.id) {
                                  form.setValue("leadEmployeeId", NO_LEAD);
                                }
                              }}
                            />
                            <span className="text-sm text-foreground">
                              {employee.firstName} {employee.lastName}
                            </span>
                            {employee.jobTitle && (
                              <span className="ml-auto text-xs text-muted-foreground">{employee.jobTitle}</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="leadEmployeeId"
              control={form.control}
              render={({ field }) => {
                const choices = employees.filter((e) => watchedMembers.includes(e.id));
                return (
                  <Field>
                    <FieldLabel htmlFor="team-lead">Responsable</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="team-lead" className="w-full">
                        <SelectValue>
                          {choices.find((e) => e.id === field.value)
                            ? `${choices.find((e) => e.id === field.value)!.firstName} ${choices.find((e) => e.id === field.value)!.lastName}`
                            : "Aucun"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_LEAD}>Aucun</SelectItem>
                        {choices.map((employee) => (
                          <SelectItem key={employee.id} value={employee.id}>
                            {employee.firstName} {employee.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>Se choisit parmi les membres de l&apos;équipe.</FieldDescription>
                  </Field>
                );
              }}
            />
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="team-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {isEditing ? "Enregistrer" : "Créer l'équipe"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function TeamsSection() {
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } = useTeamsQuery();
  const remove = useDeleteTeam();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TeamRecord | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<TeamRecord | undefined>(undefined);

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Équipe supprimée.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer cette équipe.");
    }
  }

  const createButton = (
    <Button onClick={openCreate}>
      <Plus />
      Nouvelle équipe
    </Button>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Équipes</h2>
          <p className="text-sm text-muted-foreground">
            Regroupez vos employés par métier, par chantier, comme vous voulez.
          </p>
        </div>
        {createButton}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        /* An error is not an empty list. "Aucune équipe" after a failed request tells someone
           their teams are gone, when they were simply not read.
           And `isError` alone is too wide: a failed background refetch keeps it true over rows
           that are still right, so the panel only wins with nothing read at all (`!data`) or rows
           left over from another query key (`isPlaceholderData`). */
        <LoadErrorState
          error={loadError}
          title="Équipes indisponibles"
          fallback="Vos équipes n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Aucune équipe"
          description="Créez une équipe pour regrouper des employés et désigner un responsable."
          action={createButton}
        />
      ) : (
        <ul className="space-y-2">
          {data.map((team) => (
            <li key={team.id} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-foreground">{team.name}</span>
                  {team.leadName && (
                    <span className="text-sm text-muted-foreground">· {team.leadName}</span>
                  )}
                </div>
                {team.description && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{team.description}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {team.members.map((member) => (
                    <Badge key={member.id} variant="secondary">
                      {member.firstName} {member.lastName}
                    </Badge>
                  ))}
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions pour ${team.name}`} />}>
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(team);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil />
                    Modifier
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(team)}>
                    <Trash2 />
                    Supprimer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <TeamFormSheet open={formOpen} onOpenChange={setFormOpen} team={editing} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer cette équipe ?"
        description={`« ${deleteTarget?.name} » sera supprimée. Les employés qui en font partie restent au dossier.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
