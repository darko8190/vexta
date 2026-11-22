"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { ProductSearchResult } from "@/lib/types";

function formatNumber(value: number): string {
  return `A-${String(value).padStart(4, "0")}`;
}

/**
 * Finds a product for a material or equipment line.
 *
 * It searches rather than listing: a catalogue is thousands of rows and the person filling an
 * invoice knows the code or the first word of the name. Choosing one hands the whole price
 * back — cost, margin and selling price — so the line can be built from the catalogue and then
 * corrected, which is the order the work actually happens in.
 */
export function ProductPicker({
  id,
  onPick,
  placeholder = "Chercher un produit…",
}: {
  id?: string;
  onPick: (product: ProductSearchResult) => void;
  placeholder?: string;
}) {
  const [typed, setTyped] = useState("");
  const term = useDebouncedValue(typed.trim(), 250);

  const { data, isFetching } = useQuery({
    queryKey: ["products", "search", term],
    queryFn: () => api.get<ProductSearchResult[]>(`products/search?term=${encodeURIComponent(term)}`),
    // Two characters: one letter matches most of a catalogue, and the request it costs is one
    // nobody can use the answer to.
    enabled: term.length >= 2,
    placeholderData: (previous) => previous,
  });

  const items = useMemo(() => data ?? [], [data]);

  return (
    <Combobox
      items={items}
      value={null}
      inputValue={typed}
      onInputValueChange={setTyped}
      onValueChange={(next) => {
        const picked = next as ProductSearchResult | null;
        if (!picked) return;
        onPick(picked);
        // Cleared on purpose: the picker is a way in, not a field. What was chosen is now on
        // the line beside it, where it can be edited.
        setTyped("");
      }}
      itemToStringLabel={(product: ProductSearchResult) => product.title}
    >
      <div className="relative">
        <ComboboxInput id={id} placeholder={placeholder} />
        <ComboboxTrigger />
      </div>

      <ComboboxContent>
        <ComboboxEmpty>
          {term.length < 2
            ? "Tapez au moins deux caractères."
            : isFetching
              ? "Recherche…"
              : "Aucun produit ne correspond."}
        </ComboboxEmpty>
        <ComboboxList>
          {(product: ProductSearchResult) => (
            <ComboboxItem key={product.id} value={product}>
              <span className="truncate font-medium">{product.title}</span>
              <span className="truncate text-xs text-muted-foreground">
                {[
                  product.code ?? formatNumber(product.number),
                  product.categoryName,
                  product.tracksInventory ? `${product.quantityAvailable} dispo` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
