"use client";

import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatMoment } from "@/lib/dates";

export type SendEntityType = "facture" | "soumission" | "fournisseur" | "formulaire" | "actif";

interface SendLogEntry {
  id: string;
  kind: string;
  to: string;
  cc: string | null;
  subject: string;
  sentByName: string | null;
  sentAt: string;
}

export function useSendHistoryQuery(type: SendEntityType, id: string) {
  return useQuery({
    queryKey: ["envois", type, id],
    queryFn: () => api.get<SendLogEntry[]>(`envois?type=${type}&id=${id}`),
  });
}

/**
 * Every message sent about a record: the first send, the ones sent again, the reminders the
 * application sent by itself. Newest first.
 */
export function SendHistoryCard({ type, id, className }: { type: SendEntityType; id: string; className?: string }) {
  const { data, isLoading } = useSendHistoryQuery(type, id);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" />
          Historique d&apos;envois
          {data && data.length > 0 && <Badge variant="secondary">{data.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Rien n&apos;a encore été envoyé.</p>
        ) : (
          <ol className="space-y-3">
            {data.map((entry) => (
              <li key={entry.id} className="border-l-2 border-border pl-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={entry.kind === "Relance" ? "outline" : "secondary"}>{entry.kind}</Badge>
                  <span className="text-muted-foreground">{formatMoment(entry.sentAt)}</span>
                </div>
                <p className="mt-0.5 truncate text-foreground" title={entry.subject}>
                  {entry.subject}
                </p>
                <p className="text-xs text-muted-foreground">
                  À {entry.to}
                  {entry.cc && ` · Cc ${entry.cc}`}
                  {entry.sentByName ? ` · par ${entry.sentByName}` : " · envoi automatique"}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
