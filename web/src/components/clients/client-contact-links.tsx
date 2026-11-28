"use client";

import { Mail, Phone } from "lucide-react";
import { useClientQuery } from "@/hooks/use-clients";
import { cn } from "@/lib/utils";

/**
 * The client's telephone and courriel, each one tap away: the telephone calls, the courriel
 * opens a message. Given directly when the record already carries them, read from the client
 * otherwise. Nothing is drawn when the client has neither.
 */
export function ClientContactLinks({
  clientId,
  phone,
  email,
  className,
}: {
  clientId?: string;
  phone?: string | null;
  email?: string | null;
  className?: string;
}) {
  const given = phone !== undefined || email !== undefined;
  const { data: client } = useClientQuery(given ? undefined : clientId);
  const tel = given ? phone : client?.phone;
  const mail = given ? email : client?.email;
  if (!tel && !mail) return null;

  const link =
    "inline-flex min-h-8 items-center gap-1.5 rounded-md text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}>
      {tel && (
        <a href={`tel:${tel.replace(/[^\d+]/g, "")}`} className={link} aria-label={`Appeler le ${tel}`}>
          <Phone className="size-3.5 shrink-0" />
          <span className="tabular-nums">{tel}</span>
        </a>
      )}
      {mail && (
        <a href={`mailto:${mail}`} className={cn(link, "min-w-0")} aria-label={`Écrire à ${mail}`}>
          <Mail className="size-3.5 shrink-0" />
          <span className="truncate">{mail}</span>
        </a>
      )}
    </div>
  );
}
