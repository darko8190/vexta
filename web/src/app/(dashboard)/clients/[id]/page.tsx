"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, FileText, FolderKanban, Mail, MapPin, Pencil, Phone, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { ClientFormSheet } from "@/components/clients/client-form-sheet";
import { ClientAccessControls } from "@/components/clients/client-access-controls";
import { ClientContactsSection } from "@/components/clients/detail/client-contacts-section";
import { ClientDetailNav, type DetailSection } from "@/components/clients/detail/client-detail-nav";
import {
  ClientAddressesSection,
  ClientInvoicesSection,
  ClientProjectsSection,
} from "@/components/clients/detail/client-related-lists";
import { useClientQuery } from "@/hooks/use-clients";
import { formatClientNumber } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: client, isLoading, isError } = useClientQuery(id);
  const [section, setSection] = useState("contacts");
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !client) {
    return (
      <EmptyState
        icon={UserRound}
        title="Client introuvable"
        description="Cette fiche n'existe plus, ou vous n'y avez pas accès."
        action={
          <Link href="/clients" className={cn(buttonVariants())}>
            Retour aux clients
          </Link>
        }
      />
    );
  }

  const sections: DetailSection[] = [
    { key: "contacts", label: "Contacts", count: client.contactCount, icon: UserRound },
    { key: "adresses", label: "Adresses", count: client.addressCount, icon: MapPin },
    { key: "projets", label: "Projets", count: client.projectCount, icon: FolderKanban },
    { key: "factures", label: "Factures", count: client.invoiceCount, icon: FileText },
  ];

  const address = client.primaryAddress;

  return (
    <div>
      <Link
        href="/clients"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Clients
      </Link>

      {/* Identity card. Everything here is on the client itself; the sections below are what
          hangs off it. */}
      <div className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {formatClientNumber(client.number)}
              </span>
              <Badge variant={client.type === "Entreprise" ? "default" : "secondary"}>
                {client.type === "Entreprise" ? "Entreprise" : "Particulier"}
              </Badge>
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {client.name}
            </h1>
            {client.type === "Entreprise" && (client.firstName || client.lastName) && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                Contact : {client.firstName} {client.lastName}
              </p>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil />
            Modifier
          </Button>
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {client.phone && (
            <div>
              <dt className="text-muted-foreground">Téléphone</dt>
              <dd>
                <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1.5 text-foreground hover:underline">
                  <Phone className="size-3.5 shrink-0" />
                  {client.phone}
                </a>
              </dd>
            </div>
          )}
          {client.email && (
            <div className="min-w-0">
              <dt className="text-muted-foreground">Courriel</dt>
              <dd className="truncate">
                <a href={`mailto:${client.email}`} className="inline-flex max-w-full items-center gap-1.5 text-foreground hover:underline">
                  <Mail className="size-3.5 shrink-0" />
                  <span className="truncate">{client.email}</span>
                </a>
              </dd>
            </div>
          )}
          {address && (
            <div className="min-w-0">
              <dt className="text-muted-foreground">Adresse</dt>
              <dd className="flex items-start gap-1.5 text-foreground">
                <Building2 className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {[address.line1, address.apartment].filter(Boolean).join(", ")}
                  <br />
                  {[address.city, address.province, address.postalCode].filter(Boolean).join(", ")}
                </span>
              </dd>
            </div>
          )}
        </dl>

        {/* Only a particulier is a person who can sign in. An entreprise is a company and has
            nobody to be: its people are its contacts, each invited in their own right. */}
        {client.type === "Particulier" && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-sm text-muted-foreground">
              Accès au portail — ses projets et ses factures, rien d&apos;autre.
            </p>
            <ClientAccessControls
              clientId={client.id}
              email={client.email}
              name={client.name}
              access={client.access}
            />
          </div>
        )}
      </div>

      {/* The rail sits beside the content from md up and becomes a scrollable row below it. */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <ClientDetailNav sections={sections} active={section} onSelect={setSection} />

        <div className="min-w-0 flex-1">
          {section === "contacts" && <ClientContactsSection clientId={client.id} />}
          {section === "adresses" && <ClientAddressesSection clientId={client.id} />}
          {section === "projets" && <ClientProjectsSection clientId={client.id} />}
          {section === "factures" && <ClientInvoicesSection clientId={client.id} />}
        </div>
      </div>

      <ClientFormSheet open={editOpen} onOpenChange={setEditOpen} client={client} />
    </div>
  );
}
