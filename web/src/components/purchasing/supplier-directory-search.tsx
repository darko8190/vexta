"use client";

import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useSupplierDirectoryQuery } from "@/hooks/use-suppliers";
import type { SupplierDirectoryEntry } from "@/lib/types";

/**
 * Looks for the supplier among the companies already on Vexta, and fills the card from what it
 * publishes about itself.
 *
 * A search, not a dropdown of everything: two characters before it asks, and only companies
 * that have published their public page can appear — their name and address are already at
 * /e/{slug} for anyone to read, so nothing here is disclosed that was not already public.
 *
 * Picking one is a shortcut for typing, not a link. The card still belongs to the buyer and can
 * be edited freely afterwards; the connection to that company is made later, by the address,
 * when it signs up — or straight away if it already has.
 */
export function SupplierDirectorySearch({
  onPick,
}: {
  onPick: (entry: SupplierDirectoryEntry) => void;
}) {
  const [typed, setTyped] = useState("");
  // Debounced: this searches across companies, and a request per keystroke would be a request
  // per keystroke on somebody else's data.
  const term = useDebouncedValue(typed, 300);
  const { data: entries, isFetching } = useSupplierDirectoryQuery(term);

  const matches = entries ?? [];
  const asked = term.trim().length >= 2;

  return (
    <Field>
      <FieldLabel htmlFor="supplier-directory">Déjà sur Vexta ?</FieldLabel>
      <Combobox
        items={matches}
        value={null}
        inputValue={typed}
        onInputValueChange={setTyped}
        onValueChange={(next) => {
          const picked = next as SupplierDirectoryEntry | null;
          if (!picked) return;
          onPick(picked);
          setTyped("");
        }}
        itemToStringLabel={(entry: SupplierDirectoryEntry) => entry.name}
      >
        <div className="relative">
          <ComboboxInput id="supplier-directory" placeholder="Chercher une entreprise…" />
          <ComboboxTrigger />
        </div>

        <ComboboxContent>
          <ComboboxEmpty>
            {!asked
              ? "Tapez au moins deux lettres."
              : isFetching
                ? "Recherche…"
                : "Aucune entreprise trouvée. Remplissez la fiche à la main."}
          </ComboboxEmpty>
          <ComboboxList>
            {(entry: SupplierDirectoryEntry) => (
              <ComboboxItem key={entry.slug} value={entry}>
                <span className="flex items-center gap-1.5 truncate font-medium">
                  <BadgeCheck className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                  {entry.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {[entry.city, entry.province].filter(Boolean).join(", ") || "Sur Vexta"}
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      <FieldDescription>
        Seules les entreprises qui ont publié leur page publique apparaissent. En choisir une
        remplit la fiche — vous pouvez tout corriger ensuite.
      </FieldDescription>
    </Field>
  );
}
