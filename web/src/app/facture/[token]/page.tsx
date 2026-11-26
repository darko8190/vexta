"use client";

import { Suspense, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Ban, CheckCircle2, CreditCard, Lock, Receipt, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatAmount } from "@/lib/money";
import { formatDateOnly } from "@/lib/dates";
import type { PublicInvoice } from "@/lib/types";

/** The one failure worth telling apart: this link leads nowhere. */
class InvoiceNotFound extends Error {}

/**
 * Paying one invoice from the link that arrived with it.
 *
 * Pattern: Detail / Record — one record, one action, in a centred card with no app chrome. The
 * person here is a customer of a contractor, not a user of Vexta: no sidebar, no sign-in, no
 * account, and nothing to read but the invoice they were sent and the button that settles it.
 *
 * Every figure comes from the API and no amount is ever sent back. The only thing this page
 * tells the server is "whoever holds this link pressed pay".
 */
export default function InvoicePaymentPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <Spinner />
        </Shell>
      }
    >
      <InvoicePayment />
    </Suspense>
  );
}

function Shell({ children, accent }: { children: React.ReactNode; accent?: string | null }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md">
        {/* The company's own colour, as a line at the top rather than as a background: it is
            somebody else's brand on a Vexta page, and a whole card in an unknown colour is a
            card whose text may turn out to be unreadable. */}
        <div className="h-1.5 rounded-t-xl" style={{ backgroundColor: accent ?? "var(--primary)" }} />
        <div className="rounded-b-xl border border-t-0 border-border bg-card p-6 shadow-sm">
          {children}
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3" />
          Paiement traité par Stripe ou PayPal. Vexta ne voit jamais votre numéro de carte.
        </p>
      </div>
    </main>
  );
}

function InvoicePayment() {
  const params = useParams<{ token: string }>();
  const search = useSearchParams();
  const token = params.token;

  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returned = search.get("paiement");
  const sessionId = returned === "succes" ? search.get("session_id") : null;
  // PayPal sends the customer back with its order id in « token ».
  const paypalOrder = search.get("paypal") === "succes" ? search.get("token") : null;

  /**
   * The invoice — read, or recorded first when Stripe has just sent somebody back.
   *
   * Coming back from Stripe is the same question with one extra step, so it is the same query
   * rather than an effect beside it: confirming returns the invoice in the same shape reading it
   * does. The session id is in the key, so a return is confirmed once and a later visit to the
   * bare URL simply reads.
   */
  const { data: invoice, isLoading, error: failure, refetch, isRefetching } = useQuery({
    queryKey: ["public-invoice", token, sessionId, paypalOrder],
    retry: false,
    queryFn: async () => {
      const base = `/api/public/factures/${encodeURIComponent(token)}`;

      const response = sessionId
        ? await fetch(`${base}/confirmation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
            cache: "no-store",
          })
        : paypalOrder
          ? await fetch(`${base}/paypal/confirmation`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId: paypalOrder }),
              cache: "no-store",
            })
          : await fetch(base, { cache: "no-store" });

      if (response.status === 404) throw new InvoiceNotFound();
      if (!response.ok) throw new Error("Cette facture n'a pas pu être lue.");

      return (await response.json()) as PublicInvoice;
    },
  });

  async function pay(provider: "stripe" | "paypal" = "stripe") {
    setError(null);
    setStarting(true);

    try {
      const path = provider === "paypal" ? "paypal" : "paiement";
      const response = await fetch(`/api/public/factures/${encodeURIComponent(token)}/${path}`, {
        method: "POST",
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as
        | { url?: string; message?: string }
        | null;

      if (response.ok && data?.url) {
        // Assigned rather than opened: Stripe brings the customer back to this same URL, and a
        // payment that finishes in a tab nobody is watching is a payment nobody sees land.
        window.location.assign(data.url);
        return;
      }

      setError(data?.message ?? "Le paiement n'a pas pu être démarré.");
    } catch {
      setError("Le paiement n'a pas pu être démarré. Vérifiez votre connexion.");
    }

    setStarting(false);
  }

  if (isLoading) {
    return (
      <Shell>
        <Spinner />
      </Shell>
    );
  }

  if (failure instanceof InvoiceNotFound) {
    return (
      <Shell>
        <Receipt className="size-6 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">Facture introuvable</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ce lien ne correspond à aucune facture. Il a peut-être été coupé en deux par votre
          logiciel de courriel — essayez de le copier au complet, ou écrivez à l&apos;entreprise
          qui vous l&apos;a envoyé.
        </p>
      </Shell>
    );
  }

  if (failure || !invoice) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-foreground">Service momentanément indisponible</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nous n&apos;avons pas pu lire cette facture. Réessayez dans un instant.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => void refetch()} disabled={isRefetching}>
          {isRefetching && <Spinner />}
          Réessayer
        </Button>
      </Shell>
    );
  }

  return (
    <Shell accent={invoice.companyBrandColor}>
      <p className="text-sm font-medium text-muted-foreground">{invoice.companyName}</p>
      <h1 className="mt-0.5 text-xl font-semibold text-foreground">Facture {invoice.number}</h1>

      <dl className="mt-5 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Émise le</dt>
          <dd className="text-foreground">{formatDateOnly(invoice.issueDate)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Échéance</dt>
          <dd className="text-foreground">{formatDateOnly(invoice.dueDate)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Total</dt>
          <dd className="tabular-nums text-foreground">
            {formatAmount(invoice.total, invoice.currency)}
          </dd>
        </div>
        {/* Shown only when some of it has arrived. On an untouched invoice a "Déjà payé : 0 $"
            line answers a question nobody asked. */}
        {invoice.paid > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Déjà payé</dt>
            <dd className="tabular-nums text-foreground">
              {formatAmount(invoice.paid, invoice.currency)}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-4 border-t border-border pt-2 font-semibold">
          <dt className="text-foreground">À payer</dt>
          <dd className="tabular-nums text-foreground">
            {formatAmount(invoice.outstanding, invoice.currency)}
          </dd>
        </div>
      </dl>

      {invoice.isCancelled ? (
        <p className="mt-5 flex gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
          <Ban className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>Cette facture a été annulée. Il n&apos;y a rien à payer.</span>
        </p>
      ) : invoice.isPaid ? (
        <p className="mt-5 flex gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            Cette facture est réglée. Merci — {invoice.companyName} en a reçu la confirmation.
          </span>
        </p>
      ) : invoice.canPayOnline || invoice.canPayPayPal ? (
        <>
          {returned === "annule" && (
            <p className="mt-5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Paiement interrompu. Rien n&apos;a été prélevé.
            </p>
          )}

          {error && (
            <p className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-foreground">
              {error}
            </p>
          )}

          {invoice.canPayOnline && (
            <Button className="mt-5 w-full" onClick={() => void pay("stripe")} disabled={starting}>
              {starting ? <Spinner /> : <CreditCard className="size-4" />}
              Payer {formatAmount(invoice.outstanding, invoice.currency)} par carte
            </Button>
          )}
          {invoice.canPayPayPal && (
            <Button
              variant={invoice.canPayOnline ? "outline" : "default"}
              className="mt-3 w-full"
              onClick={() => void pay("paypal")}
              disabled={starting}
            >
              {starting ? <Spinner /> : <Wallet className="size-4" />}
              Payer {formatAmount(invoice.outstanding, invoice.currency)} avec PayPal
            </Button>
          )}
        </>
      ) : (
        <p className="mt-5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {invoice.companyName} n&apos;accepte pas les paiements par carte pour le moment. Réglez
          cette facture comme à l&apos;habitude.
        </p>
      )}
    </Shell>
  );
}
