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
import { ClientFormSheet } from "@/components/clients/client-form-sheet";
import { NestedSheet } from "@/components/ui/sheet";
import { useClientSummaryQuery } from "@/hooks/use-clients";
import { formatClientNumber, type ClientSummary } from "@/lib/types";

/**
 * Picking a client by typing, and making one when it is not there yet.
 *
 * It replaces a plain Select for two reasons. A select shows the stored value when its items
 * have not loaded, and the stored value here is a GUID — so editing a project greeted you with
 * an id where a name belongs. And a directory you have to scroll is unusable past a few dozen
 * clients, which is where any of this starts to matter.
 *
 * Stopping to create a client used to mean leaving the form and losing what was typed. The new
 * one is selected on the way back, so the thread is never dropped.
 */
export function ClientPicker({
  value,
  onChange,
  id,
  invalid,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const { data: clients, isLoading } = useClientSummaryQuery();
  const [createOpen, setCreateOpen] = useState(false);
  // Null while nothing has been typed, which is how the field can show the record it already
  // points at. A plain empty string would win over the selection and the form would open on a
  // placeholder where a chosen value belongs.
  const [typed, setTyped] = useState<string | null>(null);

  const selected = useMemo(
    () => clients?.find((clientItem) => clientItem.id === value) ?? null,
    [clients, value],
  );

  // Filtered here rather than by the combobox's own matcher so the number is searchable too:
  // people quote "C-0012" off an invoice far more often than they spell the company name.
  const matches = useMemo(() => {
    const needle = (typed ?? "").trim().toLowerCase();
    if (!needle) return clients ?? [];
    return (clients ?? []).filter((clientItem) =>
      `${formatClientNumber(clientItem.number)} ${clientItem.name} ${clientItem.email ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [clients, typed]);

  return (
    <>
      <Combobox
        items={matches}
        value={selected}
        inputValue={typed ?? selected?.name ?? ""}
        onInputValueChange={setTyped}
        onValueChange={(next) => {
          const picked = next as ClientSummary | null;
          onChange(picked?.id ?? "");
          setTyped(picked?.name ?? "");
        }}
        itemToStringLabel={(item: ClientSummary) => item.name}
        disabled={disabled}
      >
        <div className="relative">
          <ComboboxInput
            id={id}
            aria-invalid={invalid}
            placeholder={isLoading ? "Chargement…" : "Rechercher un client…"}
          />
          <ComboboxTrigger />
        </div>

        <ComboboxContent>
          <ComboboxEmpty>Aucun client ne correspond.</ComboboxEmpty>
          <ComboboxList>
            {(clientItem: ClientSummary) => (
              <ComboboxItem key={clientItem.id} value={clientItem}>
                <span className="truncate font-medium">{clientItem.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {formatClientNumber(clientItem.number)}
                  {clientItem.email ? ` · ${clientItem.email}` : ""}
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
            {typed?.trim() ? `Créer « ${typed.trim()} »` : "Créer un client"}
          </button>
        </ComboboxContent>
      </Combobox>

      {/* Created on behalf of the form this picker sits in: a dialog over it, never a page. */}
      <NestedSheet>
        <ClientFormSheet
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(created) => {
            onChange(created.id);
            setTyped(created.name);
          }}
        />
      </NestedSheet>
    </>
  );
}
