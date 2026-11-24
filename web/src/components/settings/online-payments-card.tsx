"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Landmark,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { LoadErrorState } from "@/components/layout/load-error-state";
import {
  useOnlinePaymentsQuery,
  useRefreshOnlinePayments,
  useStartStripeOnboarding,
  useStripeDashboardLink,
} from "@/hooks/use-online-payments";
import { ApiError } from "@/lib/api";
import { formatMoment } from "@/lib/dates";
import type { OnlinePaymentsState } from "@/lib/types";

/**
 * Asks Stripe where the account stands when the company comes back from onboarding.
 *
 * Stripe sends the person back to this screen with nothing to say: the query string means they
 * left Stripe's form, not that Stripe accepted anything. So the answer is asked for rather than
 * read off the URL, which is the only way a card that says "autorisé" can be believed.
 */
function ReturnFromStripe({ onReturn }: { onReturn: () => void }) {
  const params = useSearchParams();
  const back = params.get("paiements");
  // A ref, not a dependency: the callback is a fresh function on every render and this must run
  // once per arrival, not once per keystroke elsewhere on the page.
  const handled = useRef(false);

  useEffect(() => {
    if (!back || handled.current) return;
    handled.current = true;
    onReturn();
  }, [back, onReturn]);

  return null;
}

/** What Stripe has decided, said in one line a person can act on. */
function statusLine(state: OnlinePaymentsState): { label: string; tone: "ok" | "wait" | "off" } {
  if (!state.connected) return { label: "Non branché", tone: "off" };
  if (state.chargesEnabled) {
    return state.payoutsEnabled
      ? { label: "Autorisé", tone: "ok" }
      : { label: "Encaissement autorisé", tone: "wait" };
  }
  return state.detailsSubmitted
    ? { label: "En vérification", tone: "wait" }
    : { label: "Inscription à terminer", tone: "wait" };
}

/**
 * The company's own Stripe account: the one place it decides to be paid by card.
 *
 * Vexta never sees the money and never asks for the banking details — Stripe collects them on
 * its own pages and the company watches its payouts in its own Stripe dashboard. What this card
 * does is start that, say where it got to, and be honest about what is still in the way.
 */
export function OnlinePaymentsCard() {
  const { data, isLoading, isError, error, refetch } = useOnlinePaymentsQuery();
  const onboarding = useStartStripeOnboarding();
  const refresh = useRefreshOnlinePayments();
  const dashboard = useStripeDashboardLink();

  if (isLoading) return <Skeleton className="h-64 max-w-lg" />;
  if (isError || !data) return <LoadErrorState error={error} onRetry={() => void refetch()} />;

  const status = statusLine(data);
  const blocked = !data.platformReady || data.addressMissing;

  return (
    <Card className="max-w-lg">
      <Suspense fallback={null}>
        <ReturnFromStripe onReturn={() => refresh.mutate()} />
      </Suspense>

      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="size-4" />
            Paiements en ligne
          </CardTitle>
          <Badge
            variant={status.tone === "ok" ? "default" : status.tone === "wait" ? "secondary" : "outline"}
          >
            {status.label}
          </Badge>
        </div>
        <CardDescription>
          Branchez votre compte Stripe et faites-vous payer par carte. Un bouton
          <span> </span>
          <strong>Payer en ligne</strong> s&apos;ajoute aux factures que vous envoyez, et
          l&apos;argent va dans votre compte — jamais dans celui de Vexta.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-sm text-muted-foreground">
        {!data.included && (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            Les paiements en ligne ne sont pas inclus dans votre forfait. Écrivez-nous pour les
            ajouter.
          </p>
        )}

        {!data.platformReady && (
          <p className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>
              La passerelle de paiement n&apos;est pas configurée du côté de Vexta. Rien à faire
              de votre part : écrivez-nous.
            </span>
          </p>
        )}

        {data.platformReady && data.addressMissing && (
          <p className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>
              Ajoutez l&apos;adresse de votre entreprise dans <strong>Entreprise</strong> avant de
              commencer. Le pays d&apos;un compte Stripe ne peut plus être changé après coup.
            </span>
          </p>
        )}

        {/* What each state means, and what to do about it. One paragraph per state rather than a
            list of everything that could be true, because only one of them ever is. */}
        {!data.connected ? (
          <p>
            Stripe vous demandera votre numéro d&apos;entreprise, une pièce d&apos;identité et le
            compte bancaire où déposer l&apos;argent. Comptez dix minutes.
          </p>
        ) : data.chargesEnabled ? (
          <p className="flex gap-2 text-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              Vous pouvez encaisser.
              {data.payoutsEnabled
                ? " Les dépôts vers votre compte bancaire sont actifs."
                : " Les dépôts vers votre banque ne sont pas encore libérés par Stripe — l'argent est à vous et vous attend."}
            </span>
          </p>
        ) : data.detailsSubmitted ? (
          <p>
            Stripe a vos informations et les vérifie. Rien à faire : la page se mettra à jour
            d&apos;elle-même quand ce sera réglé.
          </p>
        ) : (
          <p>
            Votre compte est ouvert mais l&apos;inscription n&apos;est pas finie. Reprenez-la pour
            pouvoir encaisser.
          </p>
        )}

        {data.connected && !data.webhookConfigured && (
          <p className="text-xs">
            Vexta n&apos;est pas encore averti automatiquement par Stripe. Vos paiements sont
            quand même enregistrés ; utilisez <strong>Actualiser</strong> si l&apos;état ci-dessus
            vous paraît en retard.
          </p>
        )}

        {data.checkedAt && (
          <p className="text-xs">Dernière vérification auprès de Stripe : {formatMoment(data.checkedAt)}.</p>
        )}
      </CardContent>

      <CardFooter className="flex-wrap gap-2">
        <Button
          onClick={() =>
            onboarding.mutate(undefined, {
              onError: (err) =>
                toast.error(
                  err instanceof ApiError || err instanceof Error
                    ? err.message
                    : "Impossible d'ouvrir la page Stripe.",
                ),
            })
          }
          disabled={!data.included || blocked || onboarding.isPending}
        >
          {onboarding.isPending && <Spinner />}
          <Landmark className="size-4" />
          {!data.connected
            ? "Brancher Stripe"
            : data.chargesEnabled
              ? "Modifier mes informations"
              : "Reprendre l'inscription"}
        </Button>

        {data.connected && (
          <>
            <Button
              variant="outline"
              onClick={() =>
                refresh.mutate(undefined, {
                  onError: (err) =>
                    toast.error(
                      err instanceof ApiError || err instanceof Error
                        ? err.message
                        : "Stripe n'a pas répondu.",
                    ),
                })
              }
              disabled={refresh.isPending}
            >
              {refresh.isPending ? <Spinner /> : <RefreshCw className="size-4" />}
              Actualiser
            </Button>

            <Button
              variant="ghost"
              onClick={() =>
                dashboard.mutate(undefined, {
                  onError: (err) =>
                    toast.error(
                      err instanceof ApiError || err instanceof Error
                        ? err.message
                        : "Tableau de bord Stripe indisponible.",
                    ),
                })
              }
              disabled={dashboard.isPending}
            >
              {dashboard.isPending && <Spinner />}
              <ExternalLink className="size-4" />
              Mon tableau de bord Stripe
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
