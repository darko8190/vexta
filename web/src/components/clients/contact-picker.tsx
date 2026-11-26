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
import { NestedSheet } from "@/components/ui/sheet";
import { ClientContactFormSheet } from "@/components/clients/detail/client-contact-form-sheet";
import { useClientContactsQuery } from "@/hooks/use-clients";
import type { ClientContact } from "@/lib/types";

export function contactName(contact: Pick<ClientContact, "firstName" | "lastName">): string {
  return `${contact.firstName} ${contact.lastName}`.trim();
}

/**
 * Picks one of a client's contacts, and adds one without leaving the form — the new person is
 * filed on the client, so they are there for the next job too.
 *
 * Scoped to the client for the reason the address picker is: a contact belongs to a client,
 * and the server refuses anybody else's.
 */
export function ContactPicker({
  clientId,
  value,
  onChange,
  id,
  invalid,
  placeholder = "Rechercher un contact…",
}: {
  clientId: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  invalid?: boolean;
  placeholder?: string;
}) {
  const { data, isLoading } = useClientContactsQuery(clientId);
  const [createOpen, setCreateOpen] = useState(false);
  // Null while nothing has been typed, so the field shows the contact it already points at.
  const [typed, setTyped] = useState<string | null>(null);

  const contacts = useMemo(() => (clientId ? (data ?? []) : []), [clientId, data]);
  const selected = useMemo(() => contacts.find((contact) => contact.id === value) ?? null, [contacts, value]);

  const matches = useMemo(() => {
    const needle = (typed ?? "").trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((contact) =>
      [contactName(contact), contact.role, contact.email].filter(Boolean).join(" ").toLowerCase().includes(needle),
    );
  }, [contacts, typed]);

  return (
    <>
      <Combobox
        items={matches}
        value={selected}
        inputValue={typed ?? (selected ? contactName(selected) : "")}
        onInputValueChange={setTyped}
        onValueChange={(next) => {
          const picked = next as ClientContact | null;
          onChange(picked?.id ?? "");
          setTyped(picked ? contactName(picked) : "");
        }}
        itemToStringLabel={(contact: ClientContact) => contactName(contact)}
        disabled={!clientId}
      >
        <div className="relative">
          <ComboboxInput
            id={id}
            aria-invalid={invalid}
            placeholder={!clientId ? "Choisissez d'abord un client" : isLoading ? "Chargement…" : placeholder}
          />
          <ComboboxTrigger />
        </div>

        <ComboboxContent>
          <ComboboxEmpty>Aucun contact ne correspond.</ComboboxEmpty>
          <ComboboxList>
            {(contact: ClientContact) => (
              <ComboboxItem key={contact.id} value={contact}>
                <span className="truncate font-medium">{contactName(contact)}</span>
                {(contact.role || contact.email) && (
                  <span className="truncate text-xs text-muted-foreground">
                    {[contact.role, contact.email].filter(Boolean).join(" · ")}
                  </span>
                )}
              </ComboboxItem>
            )}
          </ComboboxList>

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-1 flex w-full items-center gap-1.5 rounded-md border-t border-border px-1.5 py-2 text-sm text-foreground outline-none hover:bg-accent focus-visible:bg-accent"
          >
            <Plus className="size-4 shrink-0" />
            Ajouter un contact
          </button>
        </ComboboxContent>
      </Combobox>

      {clientId && (
        <NestedSheet>
          <ClientContactFormSheet
            clientId={clientId}
            open={createOpen}
            onOpenChange={setCreateOpen}
            onSaved={(created) => {
              onChange(created.id);
              setTyped(contactName(created));
            }}
          />
        </NestedSheet>
      )}
    </>
  );
}
