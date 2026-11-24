"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Base UI needs a value for every item, and "" is not one. */
const NONE = "__aucun__";

/**
 * A dropdown of words the company already uses, with a + beside it to add one on the spot.
 *
 * For the lists that are only ever words — a contact's role, a kind of thing — where the value
 * is the text itself and there is no record behind it. The new word is offered in the list the
 * moment it is typed, and joins the company's list for good once the form it is on is saved.
 */
export function CreatableSelect({
  id,
  value,
  onChange,
  options,
  emptyLabel,
  addLabel,
  addPlaceholder,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  /** What the empty choice says: "Aucun rôle". */
  emptyLabel: string;
  /** The + button's accessible name: "Ajouter un rôle". */
  addLabel: string;
  addPlaceholder?: string;
  disabled?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [added, setAdded] = useState<string[]>([]);

  // The saved value is offered even when nobody else uses it any more, so opening an old record
  // never shows its role as blank.
  const all = [...new Set([...options, ...added, ...(value ? [value] : [])])].sort((a, b) =>
    a.localeCompare(b, "fr-CA", { sensitivity: "base" }),
  );

  function add() {
    const word = draft.trim();
    if (!word) return;

    // Typed again in another case, it is the one already there.
    const existing = all.find((option) => option.localeCompare(word, "fr-CA", { sensitivity: "base" }) === 0);
    const chosen = existing ?? word;

    if (!existing) setAdded((current) => [...current, word]);
    onChange(chosen);
    setDraft("");
    setAdding(false);
  }

  return (
    <div>
      <div className="flex gap-2">
        <Select
          value={value || NONE}
          disabled={disabled}
          onValueChange={(next: string | null) => onChange(!next || next === NONE ? "" : next)}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue>{(current: string) => (current === NONE ? emptyLabel : current)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{emptyLabel}</SelectItem>
            {all.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={addLabel}
          disabled={disabled}
          onClick={() => setAdding((current) => !current)}
        >
          <Plus />
        </Button>
      </div>

      {adding && (
        <div className="mt-2 flex gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={addPlaceholder}
            aria-label={addLabel}
            autoFocus
            maxLength={100}
            onKeyDown={(event) => {
              // Enter adds the word instead of submitting the form around it.
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
          />
          <Button type="button" onClick={add} disabled={!draft.trim()}>
            Ajouter
          </Button>
        </div>
      )}
    </div>
  );
}
