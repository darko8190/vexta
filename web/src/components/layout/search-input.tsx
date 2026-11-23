"use client";

import { Search } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

export function SearchInput({
  value,
  onChange,
  placeholder = "Rechercher…",
  id,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /**
   * Set when the field has a visible label pointing at it. The aria-label below is then
   * dropped: it would win over the label somebody can actually see, and a screen reader would
   * read out the placeholder instead of the word on screen.
   */
  id?: string;
  /** For a caller that needs the field to fill its cell rather than stop at 288 px. */
  className?: string;
}) {
  return (
    <InputGroup className={cn("w-full sm:w-72", className)}>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={id ? undefined : placeholder}
      />
    </InputGroup>
  );
}
