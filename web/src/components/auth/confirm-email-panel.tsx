"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type State = { status: "pending" } | { status: "done" } | { status: "failed"; message: string };

/**
 * The end of the confirmation link. Confirms on arrival: the click on the link was the
 * person's decision, and a second button here would only ask it again.
 */
export function ConfirmEmailPanel({ token }: { token: string }) {
  const [state, setState] = useState<State>({ status: "pending" });
  // Strict mode mounts twice in development; the second call would find the token spent.
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    void (async () => {
      try {
        const response = await fetch("/api/auth/confirmer-courriel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (response.ok) {
          setState({ status: "done" });
          return;
        }
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        setState({ status: "failed", message: data?.message ?? "La confirmation n'a pas abouti." });
      } catch {
        setState({ status: "failed", message: "Vexta est injoignable pour l'instant. Réessayez dans un moment." });
      }
    })();
  }, [token]);

  if (state.status === "pending") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-sm text-muted-foreground">
        <Spinner />
        Confirmation de votre adresse…
      </div>
    );
  }

  if (state.status === "failed") {
    return (
      <div className="space-y-4 text-center">
        <CircleAlert className="mx-auto size-8 text-destructive" />
        <h1 className="text-lg font-semibold text-foreground">Adresse non confirmée</h1>
        <p className="text-sm text-muted-foreground">{state.message}</p>
        <Link href="/mes-factures" className={buttonVariants({ variant: "outline", className: "w-full" })}>
          Aller à mes factures
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-center">
      <CircleCheck className="mx-auto size-8 text-primary" />
      <h1 className="text-lg font-semibold text-foreground">Adresse confirmée</h1>
      <p className="text-sm text-muted-foreground">
        Les factures que des entreprises ont envoyées à cette adresse sont maintenant dans votre espace.
      </p>
      <Link href="/mes-factures" className={buttonVariants({ className: "w-full" })}>
        Voir mes factures
      </Link>
    </div>
  );
}
