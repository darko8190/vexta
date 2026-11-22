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

  return (
    <Select value={value || undefined} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
        {/* The trigger renders the stored value when it has nothing else, and the stored
            value here is a GUID. Looking the name up is what keeps an id off the screen. */}
        <SelectValue placeholder={isLoading ? "Chargement…" : "Choisir un client"}>
          {(id: string) => clients?.find((clientItem) => clientItem.id === id)?.name ?? "Chargement…"}
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
