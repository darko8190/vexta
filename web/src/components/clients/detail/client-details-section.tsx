"use client";

import { Building2, Mail, MapPin, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatAmount } from "@/lib/money";
import { formatMoment } from "@/lib/dates";
import { clientStatusBadge } from "@/lib/labels";
import { formatClientNumber } from "@/lib/types";
import type { ClientRecord } from "@/lib/types";

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  );
}

/**
 * What was filled in when the client was created, in one place.
 *
 * It is the first section of the file, and the first thing somebody opening a client looks
 * for: the telephone number, the address, whether they are taxed. Those used to live in a
 * block above the rail, which made the card grow every time a field was added and left the
 * first section showing something else entirely.
 */
export function ClientDetailsSection({
  client,
}: {
  client: ClientRecord;
}) {
  const address = client.primaryAddress;
  const status = clientStatusBadge(client);

  return (
    <div>
      {/* No Modifier here: the card above carries one, it is in view from every section, and
          two identical buttons a hand's width apart is one too many. */}
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Détails</h2>
        <p className="text-sm text-muted-foreground">
          Ce qui a été saisi à la création de la fiche.
        </p>
      </div>

      <dl className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
        <Line label="Numéro">
          <span className="font-mono tabular-nums">{formatClientNumber(client.number)}</span>
        </Line>

        <Line label="Type">
          {client.type === "Entreprise" ? "Entreprise" : "Particulier"}
        </Line>

        <Line label="Nom">{client.name}</Line>

        <Line label="Statut">
          <Badge variant={status.variant}>{status.label}</Badge>
        </Line>

        {client.type === "Entreprise" && (client.firstName || client.lastName) && (
          <Line label="Personne-ressource">
            {[client.firstName, client.lastName].filter(Boolean).join(" ")}
          </Line>
        )}

        <Line label="Téléphone">
          {client.phone ? (
            <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1.5 hover:underline">
              <Phone className="size-3.5 shrink-0" />
              {client.phone}
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Line>

        <Line label="Courriel">
          {client.email ? (
            <a
              href={`mailto:${client.email}`}
              className="inline-flex max-w-full items-center gap-1.5 hover:underline"
            >
              <Mail className="size-3.5 shrink-0" />
              <span className="truncate">{client.email}</span>
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Line>

        <Line label="Numéro de taxe">
          {client.taxId ?? <span className="text-muted-foreground">—</span>}
        </Line>

        <Line label="Taxes">
          {client.isTaxExempt ? (
            <Badge variant="outline">Non taxable</Badge>
          ) : (
            "TPS et TVQ facturées"
          )}
        </Line>

        <Line label="Adresse principale">
          {address ? (
            <span className="flex items-start gap-1.5">
              <Building2 className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {[address.line1, address.apartment].filter(Boolean).join(", ")}
                <br />
                {[address.city, address.province, address.postalCode].filter(Boolean).join(", ")}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              Aucune
            </span>
          )}
        </Line>

        {/* Shown here as well as on the identity card: what a client owes is the thing you want
            to know before picking up the telephone to them. */}
        <Line label="Solde au compte">
          <span
            className={
              client.accountBalance > 0 ? "font-medium text-destructive tabular-nums" : "tabular-nums"
            }
          >
            {formatAmount(client.accountBalance)}
          </span>
        </Line>

        <Line label="Fiche créée le">{formatMoment(client.createdAt)}</Line>
        <Line label="Dernière modification">{formatMoment(client.updatedAt)}</Line>

        {client.notes && (
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Notes</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{client.notes}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
