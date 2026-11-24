"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import {
  countryOptions,
  normalizeGeo,
  subdivisionsForCountryName,
  type GeoOption,
} from "@/lib/geo";

/**
 * Picks a country by typing it.
 *
 * A dropdown of two hundred and fifty entries is a list nobody scrolls, so this is a combobox
 * and the two countries the work is actually in sit at the top of it. The search ignores
 * accents, because the whole point of the list is that nobody has to spell Côte d'Ivoire.
 *
 * The stored value is the country's French name, not a code. An address typed before this list
 * existed holds whatever its author wrote, so an off-list value is offered back as its own item
 * rather than dropped -- a picker that silently blanks a filled field is worse than a text box.
 */
export function CountrySelect({
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
  const [typed, setTyped] = useState<string | null>(null);

  const options = useMemo<GeoOption[]>(() => {
    const known = countryOptions.some((option) => normalizeGeo(option.name) === normalizeGeo(value));
    // Whatever was there before the list existed, kept selectable so it is not quietly lost.
    return value.trim() && !known ? [...countryOptions, { code: "", name: value }] : countryOptions;
  }, [value]);

  const selected = useMemo(
    () => options.find((option) => normalizeGeo(option.name) === normalizeGeo(value)) ?? null,
    [options, value],
  );

  const matches = useMemo(() => {
    const needle = normalizeGeo(typed ?? "");
    if (!needle) return options;
    return options.filter((option) => normalizeGeo(option.name).includes(needle));
  }, [options, typed]);

  return (
    <Combobox
      items={matches}
      value={selected}
      inputValue={typed ?? selected?.name ?? ""}
      onInputValueChange={setTyped}
      onValueChange={(next) => {
        const picked = next as GeoOption | null;
        onChange(picked?.name ?? "");
        setTyped(picked?.name ?? "");
      }}
      itemToStringLabel={(option: GeoOption) => option.name}
    >
      <div className="relative">
        <ComboboxInput id={id} aria-invalid={invalid} placeholder="Rechercher un pays…" />
        <ComboboxTrigger />
      </div>

      <ComboboxContent>
        <ComboboxEmpty>Aucun pays ne correspond.</ComboboxEmpty>
        <ComboboxList>
          {(option: GeoOption) => (
            <ComboboxItem key={option.code || option.name} value={option}>
              <span className="truncate">{option.name}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/**
 * The province or state, as a list where one exists and a text box everywhere else.
 *
 * Only Canada and the United States get a list. A half-finished list of regions for a country
 * nobody here invoices would refuse the one answer its author needed, and a text box at least
 * accepts it.
 */
export function SubdivisionField({
  value,
  onChange,
  countryName,
  id,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  countryName: string;
  id?: string;
  invalid?: boolean;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const known = useMemo(() => subdivisionsForCountryName(countryName), [countryName]);

  const options = useMemo<GeoOption[]>(() => {
    if (known.length === 0) return [];
    const inList = known.some(
      (option) => normalizeGeo(option.name) === normalizeGeo(value) || option.code.toLowerCase() === value.trim().toLowerCase(),
    );
    return value.trim() && !inList ? [...known, { code: "", name: value }] : known;
  }, [known, value]);

  const selected = useMemo(
    () =>
      options.find(
        (option) => normalizeGeo(option.name) === normalizeGeo(value) || option.code.toLowerCase() === value.trim().toLowerCase(),
      ) ?? null,
    [options, value],
  );

  const matches = useMemo(() => {
    const needle = normalizeGeo(typed ?? "");
    if (!needle) return options;
    return options.filter(
      (option) => normalizeGeo(option.name).includes(needle) || option.code.toLowerCase().startsWith(needle),
    );
  }, [options, typed]);

  if (known.length === 0) {
    return <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={invalid} />;
  }

  return (
    <Combobox
      items={matches}
      value={selected}
      inputValue={typed ?? selected?.name ?? ""}
      onInputValueChange={setTyped}
      onValueChange={(next) => {
        const picked = next as GeoOption | null;
        onChange(picked?.name ?? "");
        setTyped(picked?.name ?? "");
      }}
      itemToStringLabel={(option: GeoOption) => option.name}
    >
      <div className="relative">
        <ComboboxInput id={id} aria-invalid={invalid} placeholder="Rechercher…" />
        <ComboboxTrigger />
      </div>

      <ComboboxContent>
        <ComboboxEmpty>Aucune correspondance.</ComboboxEmpty>
        <ComboboxList>
          {(option: GeoOption) => (
            <ComboboxItem key={option.code || option.name} value={option}>
              <span className="truncate">{option.name}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
