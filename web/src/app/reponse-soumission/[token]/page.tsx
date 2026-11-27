"use client";

import { Suspense, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardPen, MessageSquare, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { formatDateOnly } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { BrandTheme } from "@/components/layout/brand-theme";

interface PublicQuote {
  companyName: string;
  companyBrandColor: string | null;
  label: string;
  clientName: string;
  description: string | null;
  validUntil: string | null;
  subtotal: number;
  taxes: number;
  total: number;
  currency: string;
  status: string;
  closed: string | null;
  canApprove: boolean;
  canRequestChange: boolean;
  canRefuse: boolean;
  changeRequestedAt: string | null;
}

type Answer = "approuver" | "modifier" | "refuser";

class QuoteNotFound extends Error {}

/**
 * Answering a quote from the email it came in: approve it, ask for a change, or refuse it,
 * without an account. Pattern: Detail / Record, in a centred card with no app chrome.
 */
export default function QuoteAnswerPage() {
  return (
    <Suspense fallback={<Shell><Spinner /></Shell>}>
      <QuoteAnswer />
    </Suspense>
  );
}

function Shell({ children, accent }: { children: React.ReactNode; accent?: string | null }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 px-4 py-10">
      {/* The company's colour on the buttons too, not only on the line at the top. */}
      <BrandTheme color={accent} />
      <div className="w-full max-w-md">
        <div className="h-1.5 rounded-t-xl" style={{ backgroundColor: accent ?? "var(--primary)" }} />
        <div className="rounded-b-xl border border-t-0 border-border bg-card p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
}

function QuoteAnswer() {
  const { token } = useParams<{ token: string }>();
  const asked = useSearchParams().get("reponse");
  const initial: Answer | null = asked === "approuver" || asked === "modifier" || asked === "refuser" ? asked : null;
  const [answer, setAnswer] = useState<Answer | null>(initial);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<Answer | null>(null);

  const base = `/api/public/soumissions/${encodeURIComponent(token)}`;
  const { data: quote, isLoading, error } = useQuery({
    queryKey: ["public-quote", token],
    queryFn: async () => {
      const response = await fetch(base, { cache: "no-store" });
      if (response.status === 404) throw new QuoteNotFound();
      if (!response.ok) throw new Error("Impossible de charger la soumission.");
      return (await response.json()) as PublicQuote;
    },
    retry: false,
  });

  async function send() {
    if (!answer) return;
    setPending(true);
    setProblem(null);
    try {
      const response = await fetch(`${base}/${answer}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null, note: note.trim() || null }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setProblem(body?.message ?? "Votre réponse n'a pas pu être envoyée. Réessayez.");
        return;
      }
      setDone(answer);
    } catch {
      setProblem("Votre réponse n'a pas pu être envoyée. Vérifiez votre connexion et réessayez.");
    } finally {
      setPending(false);
    }
  }

  if (isLoading) return <Shell><Spinner /></Shell>;
  if (error || !quote) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Lien invalide</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof QuoteNotFound
            ? "Cette soumission n'existe plus, ou le lien est incomplet. Communiquez avec l'entreprise."
            : "La soumission n'a pas pu être chargée. Réessayez dans un moment."}
        </p>
      </Shell>
    );
  }

  const money = (value: number) => formatAmount(value, quote.currency);

  if (done) {
    const words = {
      approuver: "Merci! La soumission est approuvée. L'entreprise a été avisée et communiquera avec vous pour la suite.",
      modifier: "Merci! Votre demande de modification a été transmise à l'entreprise.",
      refuser: "Votre réponse a été transmise à l'entreprise. Merci de l'avoir considérée.",
    }[done];
    return (
      <Shell accent={quote.companyBrandColor}>
        <CheckCircle2 className="size-8 text-emerald-600" />
        <h1 className="mt-3 text-lg font-semibold">Réponse envoyée</h1>
        <p className="mt-2 text-sm text-muted-foreground">{words}</p>
      </Shell>
    );
  }

  const offered = [
    quote.canApprove && { key: "approuver" as const, label: "Approuver", icon: CheckCircle2 },
    quote.canRequestChange && { key: "modifier" as const, label: "Demander une modification", icon: MessageSquare },
    quote.canRefuse && { key: "refuser" as const, label: "Refuser", icon: XCircle },
  ].filter(Boolean) as { key: Answer; label: string; icon: typeof CheckCircle2 }[];

  return (
    <Shell accent={quote.companyBrandColor}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ClipboardPen className="size-3.5" />
        {quote.companyName}
      </p>
      <h1 className="mt-1 text-lg font-semibold">Soumission {quote.label}</h1>
      <p className="text-sm text-muted-foreground">Pour {quote.clientName}</p>
      {quote.description && <p className="mt-3 whitespace-pre-line text-sm">{quote.description}</p>}

      <dl className="mt-4 grid gap-1 rounded-lg border border-border p-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Sous-total</dt>
          <dd className="tabular-nums">{money(quote.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Taxes</dt>
          <dd className="tabular-nums">{money(quote.taxes)}</dd>
        </div>
        <div className="flex justify-between font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{money(quote.total)}</dd>
        </div>
        {quote.validUntil && (
          <p className="pt-1 text-xs text-muted-foreground">Valide jusqu&apos;au {formatDateOnly(quote.validUntil)}</p>
        )}
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">Le détail est dans le PDF joint au courriel.</p>

      {quote.closed ? (
        <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm">{quote.closed}</p>
      ) : offered.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Pour répondre, écrivez directement à l&apos;entreprise.</p>
      ) : (
        <div className="mt-5 grid gap-3">
          <div className="grid gap-2">
            {offered.map((option) => (
              <Button
                key={option.key}
                variant={answer === option.key ? "default" : "outline"}
                onClick={() => setAnswer(option.key)}
                className="justify-start"
              >
                <option.icon />
                {option.label}
              </Button>
            ))}
          </div>

          {answer && (
            <div className="grid gap-3 border-t border-border pt-3">
              <Field>
                <FieldLabel htmlFor="answer-name">
                  {answer === "approuver" ? "Votre nom complet (signature)" : "Votre nom"}
                </FieldLabel>
                <Input id="answer-name" value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="answer-note">
                  {answer === "modifier" ? "Ce que vous aimeriez changer" : "Un message (facultatif)"}
                </FieldLabel>
                <Textarea id="answer-note" rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
              </Field>
              {problem && <p className="text-sm text-destructive">{problem}</p>}
              <Button onClick={send} disabled={pending}>
                {pending && <Spinner />}
                {answer === "approuver"
                  ? "Approuver la soumission"
                  : answer === "modifier"
                    ? "Envoyer la demande"
                    : "Refuser la soumission"}
              </Button>
              {answer === "approuver" && (
                <p className="text-xs text-muted-foreground">
                  En approuvant, vous acceptez le prix et les conditions de la soumission jointe au courriel.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}
