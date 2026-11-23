"use client";

import Link from "next/link";
import { UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { EmployeeTeam } from "@/lib/types";

/**
 * The teams this person is on.
 *
 * Its own section rather than a paragraph under Détails: a crew of fifteen on four teams is a
 * list, and a list pinned under somebody's telephone number is a list nobody finds. Read-only
 * on purpose — a team is composed from the team's own side, where you can see everyone on it
 * at once instead of adding people one file at a time.
 */
export function TeamsSection({ teams }: { teams: EmployeeTeam[] }) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Équipes</h2>
        <p className="text-sm text-muted-foreground">
          Les équipes se composent depuis le sous-onglet Équipes des{" "}
          <Link
            href="/ressources-humaines"
            className="text-foreground underline underline-offset-2"
          >
            ressources humaines
          </Link>
          .
        </p>
      </div>

      {teams.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          <UsersRound className="size-4 shrink-0" />
          Cette personne n&apos;est dans aucune équipe.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {teams.map((team) => (
            <li key={team.id}>
              <Badge variant={team.isLead ? "default" : "secondary"}>
                {team.name}
                {team.isLead && " · responsable"}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
