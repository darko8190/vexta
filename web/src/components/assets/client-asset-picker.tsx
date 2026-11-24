"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { AssetFormSheet } from "@/components/clients/detail/asset-form-sheet";
import { NestedSheet } from "@/components/ui/sheet";
import { useClientAssetsQuery } from "@/hooks/use-client-assets";
import type { ClientAsset } from "@/lib/types";

/** The two numbers it is known by, which is how a customer identifies it over the counter. */
function identifiers(asset: ClientAsset): string {
  return [
    asset.assetTypeName,
    asset.serialNumber ? `série ${asset.serialNumber}` : null,
    asset.reference,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Picks one of a client's assets, and adds one without leaving the form.
 *
 * Scoped to the client, like the address picker and for the same reason: an asset belongs to a
 * client, and a list that offered everyone's would make it one mis-click to put somebody else's
 * truck on this work order. The server checks the same thing — this list is a convenience.
 *
 * Only the ones still in service are offered. A job is being opened now, and a car that was
 * sold last year is not what it is on.
 */
export function ClientAssetPicker({
  clientId,
  value,
  onChange,
  id,
  invalid,
  placeholder = "Rechercher un actif…",
}: {
  clientId: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  invalid?: boolean;
  placeholder?: string;
}) {
  const { data, isLoading } = useClientAssetsQuery(clientId || undefined);
  const [createOpen, setCreateOpen] = useState(false);
  // Null while nothing has been typed, which is how the field can show the record it already
  // points at. A plain empty string would win over the selection.
  const [typed, setTyped] = useState<string | null>(null);

  const assets = useMemo(() => (clientId ? (data ?? []) : []), [clientId, data]);
  const selected = useMemo(
    () => assets.find((asset) => asset.id === value) ?? null,
    [assets, value],
  );

  const matches = useMemo(() => {
    const needle = (typed ?? "").trim().toLowerCase();
    if (!needle) return assets;
    return assets.filter((asset) =>
      `${asset.label} ${asset.designation} ${identifiers(asset)}`.toLowerCase().includes(needle),
    );
  }, [assets, typed]);

  return (
    <>
      <Combobox
        items={matches}
        value={selected}
        inputValue={typed ?? (selected ? selected.label : "")}
        onInputValueChange={setTyped}
        onValueChange={(next) => {
          const picked = next as ClientAsset | null;
          onChange(picked?.id ?? "");
          setTyped(picked ? picked.label : "");
        }}
        itemToStringLabel={(asset: ClientAsset) => asset.label}
        disabled={!clientId}
      >
        <div className="relative">
          <ComboboxInput
            id={id}
            aria-invalid={invalid}
            placeholder={
              !clientId ? "Choisissez d'abord un client" : isLoading ? "Chargement…" : placeholder
            }
          />
          <ComboboxTrigger />
        </div>

        <ComboboxContent>
          <ComboboxEmpty>Aucun actif ne correspond.</ComboboxEmpty>
          <ComboboxList>
            {(asset: ClientAsset) => (
              <ComboboxItem key={asset.id} value={asset}>
                <span className="truncate font-medium">{asset.label}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {identifiers(asset) || asset.designation}
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-1 flex w-full items-center gap-1.5 rounded-md border-t border-border px-1.5 py-2 text-sm text-foreground outline-none hover:bg-accent focus-visible:bg-accent"
          >
            <Plus className="size-4 shrink-0" />
            Ajouter un actif
          </button>
        </ComboboxContent>
      </Combobox>

      {/* Mounted only once a client is chosen: the sheet writes to that client's file, and
          there is no file to write to before then. Created on behalf of the form this picker
          sits in, so a dialog over it, never a page. */}
      {clientId && (
        <NestedSheet>
          <AssetFormSheet
            open={createOpen}
            onOpenChange={setCreateOpen}
            clientId={clientId}
            onCreated={(created) => {
              onChange(created.id);
              setTyped(created.label);
            }}
          />
        </NestedSheet>
      )}
    </>
  );
}
