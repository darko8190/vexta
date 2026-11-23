"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useClientAssetTypesQuery, useCreateClientAssetType } from "@/hooks/use-client-asset-types";
import { ApiError } from "@/lib/api";
import { ex } from "@/lib/placeholders";

/** Base UI needs a value for every item, and "" is not one. */
const NONE = "aucun";

/**
 * Picks one of the company's kinds of asset, and adds one without leaving the form.
 *
 * The same shape as the expense category field, deliberately: both answer "what kind of thing
 * is this" from a list the company grows itself, and somebody who has used one should not have
 * to learn the other. Stopping to go and configure a list is what makes people pick the wrong
 * kind instead of the right one.
 */
export function AssetTypeField({
  id,
  value,
  onChange,
  invalid,
}: {
  id?: string;
  /** The chosen type's id, or "" for none. */
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const { data: types, isLoading } = useClientAssetTypesQuery();
  const create = useCreateClientAssetType();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) return;

    try {
      const created = await create.mutateAsync({ name: trimmed, icon: null });
      onChange(created.id);
      setName("");
      setAdding(false);
      toast.success(`Type « ${created.name} » disponible.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'ajouter ce type.");
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <Select
          value={value || null}
          onValueChange={(next) => onChange(next === NONE ? "" : (next ?? ""))}
        >
          <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
            {/* The stored value is a GUID, so the name is looked up rather than shown as
                itself. The empty case is handled here too: these children render even when
                nothing is selected, which means the placeholder prop never gets a turn. */}
            <SelectValue>
              {(current: string) =>
                !current
                  ? isLoading
                    ? "Chargement…"
                    : "Choisir un type"
                  : (types?.find((type) => type.id === current)?.name ?? "Chargement…")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Aucun type</SelectItem>
            {(types ?? []).map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          aria-label="Ajouter un type d'actif"
          onClick={() => setAdding((current) => !current)}
        >
          <Plus />
        </Button>
      </div>

      {adding && (
        <div className="mt-2 flex gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={ex("Bloc appartements")}
            aria-label="Nom du nouveau type"
            onKeyDown={(event) => {
              // Enter adds the type instead of submitting the form around it, which would save
              // the asset without the type being created for it.
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
          />
          <Button type="button" onClick={add} disabled={create.isPending || !name.trim()}>
            {create.isPending && <Spinner />}
            Ajouter
          </Button>
        </div>
      )}
    </>
  );
}
