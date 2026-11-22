"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

type State =
  | { kind: "confirming" }
  | { kind: "activated" }
  | { kind: "pending"; message: string };

/**
 * Confirms the payment instead of asserting it. The page used to say "Abonnement activé" the
 * moment the browser arrived, which was true only if the Stripe webhook had already landed —
 * and told the opposite story to anyone whose space still read "incomplet".
 */
export function CheckoutConfirmation() {
  const sessionId = useSearchParams().get("session_id");
  const [state, setState] = useState<State>({ kind: "confirming" });

  useEffect(() => {
    let cancelled = false;

    async function confirm() {
      if (!sessionId) {
        // Reached without coming back from Stripe: the webhook remains the other way in.
        setState({
          kind: "pending",
          message:
            "Nous n'avons pas pu relire ce paiement. Connectez-vous : si Stripe l'a confirmé, votre espace est déjà actif.",
        });
        return;
      }

      try {
        const response = await fetch("/api/billing/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const data = await response.json().catch(() => null);
        if (cancelled) return;

        if (response.ok && data?.activated) {
          setState({ kind: "activated" });
          return;
        }

        setState({
          kind: "pending",
          message:
            data?.message ??
            "Stripe n'a pas encore confirmé ce paiement. Il arrive parfois avec quelques secondes de retard.",
        });
      } catch {
        if (cancelled) return;
        setState({
          kind: "pending",
          message: "Le service est momentanément injoignable. Votre paiement n'est pas perdu.",
        });
      }
    }

    confirm();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (state.kind === "confirming") {
    return (
      <>
        <Spinner className="size-8 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Confirmation du paiement…</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Un instant, nous vérifions auprès de Stripe.</p>
      </>
    );
  }

  if (state.kind === "activated") {
    return (
      <>
        <CheckCircle2 className="size-12 text-primary" />
        <h1 className="text-xl font-semibold">Abonnement activé</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Votre paiement est confirmé. Vous pouvez vous connecter à votre espace Vexta.
        </p>
        <Link href="/connexion" className={cn(buttonVariants())}>
          Se connecter
        </Link>
      </>
    );
  }

  return (
    <>
      <CircleAlert className="size-12 text-amber-500" />
      <h1 className="text-xl font-semibold">Paiement en cours de confirmation</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{state.message}</p>
      <Link href="/connexion" className={cn(buttonVariants())}>
        Se connecter
      </Link>
    </>
  );
}
