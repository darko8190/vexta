"use client";

import { InlineSheet } from "@/components/ui/sheet";
import { ClientFormSheet } from "@/components/clients/client-form-sheet";
import { formatAmount } from "@/lib/money";
import { formatMoment } from "@/lib/dates";
import { formatClientNumber } from "@/lib/types";
import type { ClientRecord } from "@/lib/types";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  );
}

/**
 * The client's own fields, ready to edit where they are read.
 *
 * It used to be a read-only card with a Modifier that opened the same fields in a form on top —
 * two steps for what is nearly always a one-field change, a new telephone number. The form is
 * now the section: change it, press Enregistrer. Annuler puts back what was saved.
 *
 * What nobody types — the number, the balance, the dates — stays above it as plain facts.
 */
export function ClientDetailsSection({ client }: { client: ClientRecord }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Détails</h2>
        <p className="text-sm text-muted-foreground">
          Modifiez les champs directement, puis enregistrez.
        </p>
      </div>

      <dl className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-4">
        <Fact label="Numéro">
          <span className="font-mono tabular-nums">{formatClientNumber(client.number)}</span>
        </Fact>
        {/* What a client owes is the thing you want to know before picking up the telephone. */}
        <Fact label="Solde au compte">
          <span
            className={
              client.accountBalance > 0 ? "font-medium text-destructive tabular-nums" : "tabular-nums"
            }
          >
            {formatAmount(client.accountBalance)}
          </span>
        </Fact>
        <Fact label="Fiche créée le">{formatMoment(client.createdAt)}</Fact>
        <Fact label="Dernière modification">{formatMoment(client.updatedAt)}</Fact>
      </dl>

      <InlineSheet>
        <ClientFormSheet open onOpenChange={() => {}} client={client} />
      </InlineSheet>
    </div>
  );
}
