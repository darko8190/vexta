"use client";

import { Mail, Phone, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatMoment } from "@/lib/dates";
import { userRoleLabels } from "@/lib/labels";
import type { Employee } from "@/lib/types";

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  );
}

/**
 * What was filled in when the employee was added, in one place — the same shape as a client's
 * Détails, because they are the same kind of thing: a person's identity, as opposed to the
 * twelve lists that hang off it.
 */
export function EmployeeDetailsSection({
  employee,
}: {
  employee: Employee;
}) {
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
        <Line label="Prénom">{employee.firstName}</Line>
        <Line label="Nom">{employee.lastName}</Line>

        <Line label="Courriel">
          <a
            href={`mailto:${employee.email}`}
            className="inline-flex max-w-full items-center gap-1.5 hover:underline"
          >
            <Mail className="size-3.5 shrink-0" />
            <span className="truncate">{employee.email}</span>
          </a>
        </Line>

        <Line label="Téléphone">
          {employee.phone ? (
            <a href={`tel:${employee.phone}`} className="inline-flex items-center gap-1.5 hover:underline">
              <Phone className="size-3.5 shrink-0" />
              {employee.phone}
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Line>

        <Line label="Titre">
          {employee.jobTitle ?? <span className="text-muted-foreground">—</span>}
        </Line>

        <Line label="Rôle">
          <Badge variant={employee.role === "TenantUser" ? "outline" : "secondary"}>
            {userRoleLabels[employee.role]}
          </Badge>
        </Line>

        <Line label="Accès à Vexta">
          {employee.isOwner ? (
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 shrink-0" />
              Propriétaire de l&apos;espace
            </span>
          ) : !employee.hasAccess ? (
            "Au dossier, sans compte"
          ) : employee.invitationExpired ? (
            "Invitation expirée"
          ) : employee.invitationPending ? (
            "Invitation envoyée"
          ) : (
            "Accès actif"
          )}
        </Line>

        <Line label="Fiche créée le">{formatMoment(employee.createdAt)}</Line>
      </dl>
    </div>
  );
}
