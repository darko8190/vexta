"use client";

import Link from "next/link";
import { ArrowUpRight, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientContactsQuery, useClientQuery } from "@/hooks/use-clients";
import { clientStatusLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import { formatClientNumber } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The client's file over the form being filled in: who they are, how to reach them, their
 * people and where they stand, without leaving the quote or the job. The full file is a link away.
 */
export function ClientQuickView({
  clientId,
  open,
  onOpenChange,
}: {
  clientId: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent layout="panel" className="w-full sm:max-w-lg">{open && clientId && <Body clientId={clientId} />}</SheetContent>
    </Sheet>
  );
}

function Body({ clientId }: { clientId: string }) {
  const { data: client, isLoading } = useClientQuery(clientId);
  const { data: contacts } = useClientContactsQuery(clientId);

  if (isLoading || !client) {
    return (
      <div className="space-y-3 p-4">
        <SheetHeader className="p-0">
          <SheetTitle>Fiche du client</SheetTitle>
          <SheetDescription>Chargement…</SheetDescription>
        </SheetHeader>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const address = client.primaryAddress;

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex flex-wrap items-center gap-2">
          {client.name}
          <Badge variant="secondary">{clientStatusLabels[client.status]}</Badge>
          {client.isBlocked && <Badge variant="destructive">Bloqué</Badge>}
        </SheetTitle>
        <SheetDescription>
          {formatClientNumber(client.number)} · {client.type === "Entreprise" ? "Entreprise" : "Particulier"}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4 text-sm">
        <dl className="grid gap-2">
          {client.email && (
            <div className="flex items-center gap-2">
              <Mail className="size-4 text-muted-foreground" />
              <a href={`mailto:${client.email}`} className="underline-offset-4 hover:underline">
                {client.email}
              </a>
            </div>
          )}
          {client.phone && (
            <div className="flex items-center gap-2">
              <Phone className="size-4 text-muted-foreground" />
              <a href={`tel:${client.phone}`} className="underline-offset-4 hover:underline">
                {client.phone}
              </a>
            </div>
          )}
          {address && (
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 text-muted-foreground" />
              <span>
                {[address.line1, address.apartment].filter(Boolean).join(", ")}
                <span className="block text-muted-foreground">
                  {[address.city, address.province, address.postalCode].filter(Boolean).join(", ")}
                </span>
              </span>
            </div>
          )}
        </dl>

        <div className="grid grid-cols-3 gap-2 text-center">
          <Figure label="Projets" value={String(client.projectCount)} />
          <Figure label="Factures" value={String(client.invoiceCount)} />
          <Figure label="Solde" value={formatAmount(client.accountBalance)} />
        </div>

        <section>
          <h3 className="mb-2 font-medium text-foreground">Contacts</h3>
          {(contacts ?? []).length === 0 ? (
            <p className="text-muted-foreground">Aucun contact.</p>
          ) : (
            <ul className="grid gap-2">
              {(contacts ?? []).map((contact) => (
                <li key={contact.id} className="rounded-md border border-border p-2">
                  <div className="flex items-center gap-2 font-medium">
                    <UserRound className="size-4 text-muted-foreground" />
                    {`${contact.firstName} ${contact.lastName}`.trim()}
                    {contact.id === client.billingContactId && <Badge variant="outline">Facturation</Badge>}
                  </div>
                  {contact.role && <p className="text-xs text-muted-foreground">{contact.role}</p>}
                  <p className="text-xs text-muted-foreground">
                    {[contact.email, contact.phone].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {client.notes && (
          <section>
            <h3 className="mb-1 font-medium text-foreground">Notes</h3>
            <p className="whitespace-pre-line text-muted-foreground">{client.notes}</p>
          </section>
        )}

        <Link href={`/clients/${client.id}`} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
          Ouvrir la fiche complète
          <ArrowUpRight />
        </Link>
      </div>
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums text-foreground">{value}</p>
    </div>
  );
}
