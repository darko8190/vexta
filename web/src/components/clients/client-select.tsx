"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClientSummaryQuery } from "@/hooks/use-clients";

export function ClientSelect({
  value,
  onChange,
  id,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  invalid?: boolean;
}) {
  const { data: clients, isLoading } = useClientSummaryQuery();

  // null, not undefined, for "nothing chosen": Base UI reads undefined as an uncontrolled
  // select and warns the moment a value arrives that the component has switched.
  return (
    <Select value={value || null} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
        {/* The trigger renders the stored value when it has nothing else, and the stored
            value here is a GUID. Looking the name up is what keeps an id off the screen. */}
        {/* The empty case is handled in here as well: these children are rendered even when
            nothing is selected, so the placeholder prop never gets a turn and an untouched
            field would otherwise read "Chargement…" for ever. */}
        <SelectValue>
          {(id: string) =>
            !id
              ? isLoading
                ? "Chargement…"
                : "Choisir un client"
              : (clients?.find((clientItem) => clientItem.id === id)?.name ?? "Chargement…")
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {clients?.map((clientItem) => (
          <SelectItem key={clientItem.id} value={clientItem.id}>
            {clientItem.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
