"use client";

import { useState } from "react";
import { Mail, MoreHorizontal, Pencil, Phone, Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { ClientAccessControls } from "@/components/clients/client-access-controls";
import { ClientContactFormSheet } from "@/components/clients/detail/client-contact-form-sheet";
import { useClientContactsQuery, useDeleteClientContact } from "@/hooks/use-clients";
import { ApiError } from "@/lib/api";
import type { ClientContact } from "@/lib/types";

export function ClientContactsSection({ clientId }: { clientId: string }) {
  const { data, isLoading } = useClientContactsQuery(clientId);
  const remove = useDeleteClientContact(clientId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientContact | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ClientContact | undefined>(undefined);

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Contact supprimé.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer ce contact.");
    }
  }

  const addButton = (
    <Button size="sm" onClick={openCreate}>
      <Plus />
      Nouveau contact
    </Button>
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Contacts</h2>
          <p className="text-sm text-muted-foreground">
            Les autres personnes à joindre chez ce client.
          </p>
        </div>
        {addButton}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="Aucun contact additionnel"
          description="Le contact principal est sur la fiche. Ajoutez ici la comptabilité, un contremaître, toute autre personne à joindre."
          action={addButton}
        />
      ) : (
        /* Cards rather than a table: five fields per person read badly in columns on a phone. */
        <ul className="space-y-2">
          {data.map((contact) => (
            <li
              key={contact.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-foreground">
                    {contact.firstName} {contact.lastName}
                  </span>
                  {contact.role && (
                    <span className="text-sm text-muted-foreground">· {contact.role}</span>
                  )}
                </div>

                <div className="mt-1 flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:gap-4">
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                      <Phone className="size-3.5 shrink-0" />
                      {contact.phone}
                    </a>
                  )}
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 truncate hover:text-foreground">
                      <Mail className="size-3.5 shrink-0" />
                      <span className="truncate">{contact.email}</span>
                    </a>
                  )}
                </div>

                {contact.notes && (
                  <p className="mt-2 text-sm text-muted-foreground">{contact.notes}</p>
                )}

                <div className="mt-3">
                  <ClientAccessControls
                    clientId={clientId}
                    contactId={contact.id}
                    email={contact.email}
                    name={`${contact.firstName} ${contact.lastName}`.trim()}
                    access={contact.access}
                  />
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions pour ${contact.firstName} ${contact.lastName}`} />}>
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(contact);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil />
                    Modifier
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(contact)}>
                    <Trash2 />
                    Supprimer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <ClientContactFormSheet
        clientId={clientId}
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editing}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer ce contact ?"
        description={`${deleteTarget?.firstName} ${deleteTarget?.lastName} sera retiré de ce client.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
