"use client";

import { CheckCircle2, Clock, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { useFormSharesQuery, useResendFormShare, type FormShare } from "@/hooks/use-forms";
import { ApiError } from "@/lib/api";
import { formatDateOnly } from "@/lib/dates";

/**
 * The forms e-mailed so far, and which came back. For one form (who was it sent to) or one
 * client (what was this client sent). A reply counts as "rempli" only when it came through the
 * link that was sent, which is the only way to know it is this person's.
 */
export function FormSharesList({
  formId,
  clientId,
  emptyAction,
}: {
  formId?: string;
  clientId?: string;
  /** The button that sends one, shown in the empty state. */
  emptyAction?: React.ReactNode;
}) {
  const { data, isLoading, isError, error, refetch } = useFormSharesQuery({ formId, clientId });
  const resend = useResendFormShare();

  async function onResend(share: FormShare) {
    try {
      await resend.mutateAsync(share.id);
      toast.success("Formulaire renvoyé.", { description: share.email });
    } catch (failure) {
      toast.error(failure instanceof ApiError ? failure.message : "Le formulaire n'a pas pu être renvoyé.");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <LoadErrorState
        error={error}
        title="Envois indisponibles"
        fallback="La liste des formulaires envoyés n'a pas pu être chargée."
        onRetry={() => refetch()}
      />
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon={Send}
        title="Aucun formulaire envoyé"
        description="Les formulaires envoyés par courriel s'affichent ici, avec ceux qui ont été remplis."
        action={emptyAction}
      />
    );
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {data.map((share) => {
        // From a form, the person is what tells rows apart; from a client, the form is.
        const heading = clientId ? share.formTitle : (share.clientName ?? share.email);
        const sub = clientId ? share.email : share.clientName ? share.email : null;
        const pending = resend.isPending && resend.variables === share.id;

        return (
          <li key={share.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{heading}</p>
              <p className="text-xs text-muted-foreground">
                {sub ? `${sub} · ` : ""}
                Envoyé le {formatDateOnly(share.sentAt)}
                {share.sentByName ? ` par ${share.sentByName}` : ""}
                {share.sendCount > 1 ? ` · renvoyé le ${formatDateOnly(share.lastSentAt)} (${share.sendCount} envois)` : ""}
              </p>
            </div>
            {share.answeredAt ? (
              <Badge variant="secondary">
                <CheckCircle2 className="size-3" />
                Rempli le {formatDateOnly(share.answeredAt)}
              </Badge>
            ) : (
              <>
                <Badge variant="outline">
                  <Clock className="size-3" />
                  En attente
                </Badge>
                <Button variant="outline" size="sm" disabled={pending} onClick={() => void onResend(share)}>
                  {pending ? <Spinner /> : <Send />}
                  Renvoyer
                </Button>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
