"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Car,
  FileText,
  FolderKanban,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  UserRound,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BlockClientDialog } from "@/components/clients/block-client-dialog";
import { ClientFormSheet } from "@/components/clients/client-form-sheet";
import { ClientAccountSection } from "@/components/clients/detail/client-account-section";
import { ClientAssetsSection } from "@/components/clients/detail/client-assets-section";
import { ClientContactsSection } from "@/components/clients/detail/client-contacts-section";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import {
  ClientAddressesSection,
  ClientInvoicesSection,
  ClientProjectsSection,
} from "@/components/clients/detail/client-related-lists";
import { useIsOwner } from "@/hooks/use-can-create";
import { useClientQuery } from "@/hooks/use-clients";
import { clientStatusBadge } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import { formatClientNumber } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: client, isLoading, isError } = useClientQuery(id);
  const isOwner = useIsOwner();
  const [section, setSection] = useState("contacts");
  const [editOpen, setEditOpen] = useState(false);
  const [blockScope, setBlockScope] = useState<"client" | "account" | null>(null);

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

  const sections: NavSection[] = [
    { key: "contacts", label: "Contacts", count: client.contactCount, icon: UserRound },
    { key: "actifs", label: "Actifs", count: client.assetCount, icon: Car },
    { key: "adresses", label: "Adresses", count: client.addressCount, icon: MapPin },
    { key: "projets", label: "Projets", count: client.projectCount, icon: FolderKanban },
    { key: "factures", label: "Factures", count: client.invoiceCount, icon: FileText },
    // No count: a balance is one figure, not a number of things, and it is shown on the card
    // above rather than squeezed into a badge.
    { key: "compte", label: "Compte", icon: Wallet },
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
              {/* Prospect, client, ancien client — or Banni when the lock is closed, which is
                  the one case where the state on screen is not the state in the column. */}
              {!client.isBlocked && (
                <Badge variant={clientStatusBadge(client).variant}>
                  {clientStatusBadge(client).label}
                </Badge>
              )}
              {client.isTaxExempt && <Badge variant="outline">Non taxable</Badge>}
              {/* Leading the card, because it changes what every button below it will do. */}
              {client.isBlocked && (
                <Badge variant="destructive">
                  <Lock />
                  Banni
                </Badge>
              )}
              {!client.isBlocked && client.isAccountBlocked && (
                <Badge variant="destructive">
                  <Lock />
                  Compte bloqué
                </Badge>
              )}
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

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil />
              Modifier
            </Button>

            {/* Who the company will do business with at all is the owner's call, not a chargé
                de projet's — the API says the same. */}
            {isOwner && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="outline" size="icon" aria-label="Blocage" />}
                >
                  <Lock />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setBlockScope("account")}>
                    {client.isAccountBlocked ? "Débloquer le compte" : "Bloquer le compte"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant={client.isBlocked ? undefined : "destructive"}
                    onClick={() => setBlockScope("client")}
                  >
                    {client.isBlocked ? "Débloquer le client" : "Bloquer le client"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {(client.isBlocked || client.isAccountBlocked) && (
          <p
            className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="status"
          >
            <Lock className="mt-0.5 size-4 shrink-0" />
            <span>
              {client.isBlocked
                ? client.blockedReason
                  ? `Client bloqué : ${client.blockedReason}`
                  : "Client bloqué."
                : client.accountBlockedReason
                  ? `Compte bloqué : ${client.accountBlockedReason}`
                  : "Compte bloqué."}{" "}
              {client.isBlocked
                ? "Aucun nouveau projet ni nouvelle facture."
                : "Rien de plus ne peut être porté au compte."}
            </span>
          </p>
        )}

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {/* Shown on the card and not only in the Compte section: what a client owes is the
              thing you want to know before picking up the phone to them. */}
          {client.accountBalance !== 0 && (
            <div>
              <dt className="text-muted-foreground">Solde au compte</dt>
              <dd
                className={
                  client.accountBalance > 0
                    ? "font-medium text-destructive tabular-nums"
                    : "text-foreground tabular-nums"
                }
              >
                {formatAmount(client.accountBalance)}
              </dd>
            </div>
          )}
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
      </div>

      {/* The rail sits beside the content from md up and becomes a scrollable row below it. */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav sections={sections} active={section} onSelect={setSection} label="Sections du client" />

        <div className="min-w-0 flex-1">
          {section === "contacts" && <ClientContactsSection clientId={client.id} />}
          {section === "actifs" && <ClientAssetsSection clientId={client.id} />}
          {section === "compte" && <ClientAccountSection clientId={client.id} />}
          {section === "adresses" && <ClientAddressesSection clientId={client.id} />}
          {section === "projets" && <ClientProjectsSection clientId={client.id} />}
          {section === "factures" && <ClientInvoicesSection clientId={client.id} />}
        </div>
      </div>

      <ClientFormSheet open={editOpen} onOpenChange={setEditOpen} client={client} />

      {blockScope && (
        <BlockClientDialog
          open
          onOpenChange={(next) => !next && setBlockScope(null)}
          client={client}
          scope={blockScope}
        />
      )}
    </div>
  );
}
