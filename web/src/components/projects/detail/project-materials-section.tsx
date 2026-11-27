"use client";

import { useRef, useState } from "react";
import { Package, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { useIsCrewView } from "@/hooks/use-can-create";
import {
  CREW_MATERIAL_GRID,
  MATERIAL_GRID,
  MaterialReadRow,
  MaterialRow,
  formatMaterialAmount,
  materialLineTotal,
} from "@/components/projects/detail/material-row";
import { useBillingSettingsQuery } from "@/hooks/use-billing-settings";
import {
  useCreateProjectMaterial,
  useDeleteProjectMaterial,
  useProjectMaterialsQuery,
  useUpdateProjectMaterial,
} from "@/hooks/use-project-materials";
import { ApiError } from "@/lib/api";
import { matchesSearch } from "@/lib/text-match";
import { SearchInput } from "@/components/layout/search-input";
import type { ProjectMaterial, SaveProjectMaterialValues } from "@/lib/types";

/** The fields of a saved material, as the row edits them. */
function toValues(material: ProjectMaterial): SaveProjectMaterialValues {
  return {
    productId: material.productId,
    code: material.code,
    description: material.description,
    unit: material.unit,
    quantity: material.quantity,
    purchasePrice: material.purchasePrice,
    marginPercent: material.marginPercent,
    unitPrice: material.unitPrice,
    projectTaskId: material.projectTaskId,
  };
}

function blankValues(taskId?: string): SaveProjectMaterialValues {
  return {
    productId: null,
    code: null,
    description: "",
    unit: null,
    quantity: 1,
    purchasePrice: null,
    marginPercent: null,
    unitPrice: 0,
    projectTaskId: taskId ?? null,
  };
}

/** A line being typed, which has no id yet because nothing has been saved. */
interface Draft {
  uid: string;
  values: SaveProjectMaterialValues;
}

/**
 * The materials posted against one project, as a table edited in place.
 *
 * Editing happens in the cells rather than in a drawer: a material is eight short fields and a
 * job has dozens of them, so opening and closing a panel per line would be most of the work.
 *
 * Saving: a saved row is written on blur, and "Ajouter un matériau" adds a blank line that is
 * only posted once it has a description. A line could not be posted the moment the button is
 * pressed — the API refuses a material without a description, and inventing one so the row can
 * exist would put "Sans titre" rows in the project of anyone who pressed the button and walked
 * away. The draft lives here until it is worth keeping.
 *
 * `locked` is the project being billed, and the table becomes a table one reads: the API refuses
 * these writes once the invoice is out, so offering a field that takes typing and then says no
 * would only waste the keystrokes. The caller owns the flag — a second place deciding the same
 * lock is a second place to get it wrong.
 */
export function ProjectMaterialsSection({
  projectId,
  locked,
  taskId,
}: {
  projectId: string;
  locked?: boolean;
  /**
   * Shows only what is attached to this task, and files new rows against it — the same section
   * as on the project, opened from the task's own page.
   */
  taskId?: string;
}) {
  const { data, isLoading } = useProjectMaterialsQuery(projectId);
  const { data: settings } = useBillingSettingsQuery();
  // The crew records what went in, never what it is worth; the office sees what to price.
  const crew = useIsCrewView();
  const needsReview = (material: ProjectMaterial) =>
    !crew && !material.productId && !material.projectAssemblyId && material.unitPrice === 0;
  const create = useCreateProjectMaterial(projectId);
  const update = useUpdateProjectMaterial(projectId);
  const remove = useDeleteProjectMaterial(projectId);

  /**
   * What has been typed into a saved row but not yet written. Read behind the server's own
   * values rather than copied into state when the list arrives: a useEffect that mirrors a
   * query into state is the one thing the lint rules here forbid, and it would also fight the
   * refetch that follows every save.
   */
  const [edits, setEdits] = useState<Record<string, SaveProjectMaterialValues>>({});
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ProjectMaterial | undefined>(undefined);

  /** What was last sent for each row, so leaving four fields in turn is not four PUTs. */
  const sent = useRef<Record<string, string>>({});
  /** Drafts with a POST in flight, so a second blur does not post the same line twice. */
  const posting = useRef(new Set<string>());
  const nextUid = useRef(0);

  const [search, setSearch] = useState("");
  const materials = (data ?? []).filter(
    (material) =>
      (!taskId || material.projectTaskId === taskId) &&
      matchesSearch(search, material.description, material.code, material.unit, material.projectTaskTitle),
  );
  const marginMode = settings?.marginMode ?? "Multiplication";

  function valuesOf(material: ProjectMaterial): SaveProjectMaterialValues {
    return edits[material.id] ?? toValues(material);
  }

  /**
   * Whether the row says enough to be saved. A row that fails this is mid-edit, not wrong:
   * it is left alone and written as soon as it reads properly again, which is quieter than a
   * toast for every field someone tabs through while clearing a description.
   */
  function isSavable(values: SaveProjectMaterialValues): boolean {
    return values.description.trim() !== "" && values.quantity > 0;
  }

  function message(error: unknown, fallback: string): string {
    return error instanceof ApiError ? error.message : fallback;
  }

  async function commitExisting(material: ProjectMaterial, values: SaveProjectMaterialValues) {
    if (!isSavable(values)) return;

    const payload = JSON.stringify(values);
    const baseline = sent.current[material.id] ?? JSON.stringify(toValues(material));
    if (payload === baseline) return;

    sent.current[material.id] = payload;

    try {
      await update.mutateAsync({ id: material.id, values });
    } catch (error) {
      // Forgotten, so leaving the field again retries rather than silently keeping a change
      // the server never accepted.
      delete sent.current[material.id];
      toast.error(message(error, "Impossible d'enregistrer ce matériau."));
    }
  }

  async function commitDraft(uid: string, values: SaveProjectMaterialValues) {
    if (!isSavable(values) || posting.current.has(uid)) return;

    posting.current.add(uid);

    try {
      await create.mutateAsync(values);
      setDrafts((previous) => previous.filter((draft) => draft.uid !== uid));
    } catch (error) {
      toast.error(message(error, "Impossible d'ajouter ce matériau."));
    } finally {
      posting.current.delete(uid);
    }
  }

  function addDraft() {
    nextUid.current += 1;
    setDrafts((previous) => [...previous, { uid: `draft-${nextUid.current}`, values: blankValues(taskId) }]);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { id } = deleteTarget;

    try {
      await remove.mutateAsync(id);
      setEdits((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      delete sent.current[id];
      toast.success("Matériau supprimé.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(message(error, "Impossible de supprimer ce matériau."));
    }
  }

  const total =
    materials.filter((material) => !material.projectAssemblyId).reduce((sum, material) => sum + materialLineTotal(valuesOf(material)), 0) +
    drafts.reduce((sum, draft) => sum + materialLineTotal(draft.values), 0);

  const addButton = locked ? undefined : (
    <Button onClick={addDraft}>
      <Plus />
      Ajouter un matériau
    </Button>
  );

  const rows = materials.length + drafts.length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Matériaux</h2>
          <p className="text-sm text-muted-foreground">
            Ce qui entre dans le projet, pris au catalogue ou saisi à la main.
          </p>
        </div>
        {addButton}
      </div>

      {(data?.length ?? 0) > 0 && (
        <div className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un matériau…" />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : rows === 0 ? (
        <EmptyState
          icon={Package}
          title="Aucun matériau"
          description="Le contreplaqué, les tuyaux, la visserie : cherchez un produit du catalogue ou saisissez la ligne à la main."
          action={addButton}
        />
      ) : (
        <div className="space-y-3">
          {/* The headings, from lg up. Below that each field carries its own. */}
          <div
            className={`hidden items-end gap-2 px-3 text-xs font-medium text-muted-foreground lg:grid ${crew ? CREW_MATERIAL_GRID : MATERIAL_GRID}`}
          >
            <span>Code</span>
            <span>Description</span>
            <span>Unité</span>
            <span className="text-right">Qté</span>
            {!crew && (
              <>
                <span className="text-right">Prix d&apos;achat</span>
                <span className="text-right">Marge %</span>
                <span className="text-right">Prix vendant</span>
                <span className="text-right">Total</span>
              </>
            )}
            <span />
          </div>

          {materials.map((material) =>
            locked ? (
              <MaterialReadRow
                key={material.id}
                values={valuesOf(material)}
                taskTitle={material.projectTaskTitle}
                hidePrices={crew}
                assemblyName={material.projectAssemblyName}
              />
            ) : (
              <MaterialRow
                key={material.id}
                values={valuesOf(material)}
                projectId={projectId}
                marginMode={marginMode}
                onChange={(next) => setEdits((previous) => ({ ...previous, [material.id]: next }))}
                onCommit={(next) => void commitExisting(material, next)}
                onRemove={() => setDeleteTarget(material)}
                removeLabel={`Supprimer ${material.description || "le matériau"}`}
                hidePrices={crew}
                needsReview={needsReview(material)}
                assemblyName={material.projectAssemblyName}
              />
            ),
          )}

          {/* A line still being typed when the project gets billed: there is nowhere to save it
              any more, so it stops offering to. */}
          {!locked &&
            drafts.map((draft) => (
              <MaterialRow
                key={draft.uid}
                values={draft.values}
                projectId={projectId}
                marginMode={marginMode}
                onChange={(next) =>
                  setDrafts((previous) =>
                    previous.map((row) => (row.uid === draft.uid ? { ...row, values: next } : row)),
                  )
                }
                onCommit={(next) => void commitDraft(draft.uid, next)}
                // Nothing has been saved, so there is nothing to confirm losing.
                onRemove={() =>
                  setDrafts((previous) => previous.filter((row) => row.uid !== draft.uid))
                }
                removeLabel="Retirer cette ligne"
                hidePrices={crew}
              />
            ))}

          {/* The sum of what is on screen, including a draft that has not been saved yet: it
              is the figure someone is checking while they type, and the cost table beside the
              project has the saved one. */}
          {!crew && (
            <div className="px-3 text-right text-sm text-muted-foreground">
              Total des matériaux{" "}
              <span className="font-medium tabular-nums text-foreground">
                {formatMaterialAmount(total)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* The lock is read on every render, not only when the button that opens this was drawn:
          a project can be invoiced from another tab while the dialog stands open. */}
      <ConfirmDeleteDialog
        open={Boolean(deleteTarget) && !locked}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer ce matériau ?"
        description={`« ${deleteTarget?.description} » sera retiré du projet et de ses coûts.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
