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
import { AddressFormSheet } from "@/components/addresses/address-form-sheet";
import { useAddressesQuery } from "@/hooks/use-addresses";
import type { AddressRecord } from "@/lib/types";

function oneLine(address: AddressRecord): string {
  return [address.line1, address.line2].filter(Boolean).join(", ");
}

function place(address: AddressRecord): string {
  return [address.city, address.province, address.postalCode].filter(Boolean).join(", ");
}

/**
 * Picks one of a client's addresses, and adds one without leaving the form.
 *
 * Scoped to the client on purpose: an address belongs to a client, and a list that offered
 * everyone's would make it one mis-click to print another company's street on this invoice.
 * The server checks the same thing, because this list is only a convenience.
 */
export function AddressPicker({
  clientId,
  value,
  onChange,
  id,
  invalid,
  placeholder = "Rechercher une adresse…",
}: {
  clientId: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  invalid?: boolean;
  placeholder?: string;
}) {
  // One page is enough: a client with more than a hundred addresses on file is not a case worth
  // paging for, and the search below narrows what is shown anyway.
  const { data, isLoading } = useAddressesQuery(1, "", clientId || undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");

  const addresses = useMemo(() => (clientId ? (data?.items ?? []) : []), [clientId, data]);
  const selected = useMemo(
    () => addresses.find((address) => address.id === value) ?? null,
    [addresses, value],
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return addresses;
    return addresses.filter((address) =>
      `${oneLine(address)} ${place(address)}`.toLowerCase().includes(needle),
    );
  }, [addresses, query]);

  return (
    <>
      <Combobox
        items={matches}
        value={selected}
        inputValue={query}
        onInputValueChange={setQuery}
        onValueChange={(next) => {
          const picked = next as AddressRecord | null;
          onChange(picked?.id ?? "");
          setQuery(picked ? oneLine(picked) : "");
        }}
        itemToStringLabel={(address: AddressRecord) => oneLine(address)}
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
          <ComboboxEmpty>Aucune adresse ne correspond.</ComboboxEmpty>
          <ComboboxList>
            {(address: AddressRecord) => (
              <ComboboxItem key={address.id} value={address}>
                <span className="truncate font-medium">{oneLine(address)}</span>
                <span className="truncate text-xs text-muted-foreground">{place(address)}</span>
              </ComboboxItem>
            )}
          </ComboboxList>

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-1 flex w-full items-center gap-1.5 rounded-md border-t border-border px-1.5 py-2 text-sm text-foreground outline-none hover:bg-accent focus-visible:bg-accent"
          >
            <Plus className="size-4 shrink-0" />
            Ajouter une adresse
          </button>
        </ComboboxContent>
      </Combobox>

      <AddressFormSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultClientId={clientId}
        onCreated={(created) => {
          onChange(created.id);
          setQuery(oneLine(created));
        }}
      />
    </>
  );
}
