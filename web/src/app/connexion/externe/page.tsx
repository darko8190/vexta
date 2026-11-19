"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { VextaLogo } from "@/components/brand/vexta-logo";
import { useAuth } from "@/lib/auth-context";

function ExchangeCode() {
  const params = useSearchParams();
  const router = useRouter();
  const { refresh } = useAuth();
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  const code = params.get("code");
  // Derived, not stored: a missing code is a fact about the URL, not something that happens.
  const error = exchangeError ?? (code ? null : "Lien de connexion incomplet.");

  useEffect(() => {
    if (!code) return;

    let cancelled = false;

    async function finish(oneTimeCode: string) {
      try {
        const response = await fetch("/api/auth/external/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: oneTimeCode }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message ?? "Impossible de terminer la connexion.");
        if (cancelled) return;
        await refresh();
        router.replace("/tableau-de-bord");
      } catch (caught) {
        if (!cancelled) {
          setExchangeError(
            caught instanceof Error ? caught.message : "Impossible de terminer la connexion.",
          );
        }
      }
    }

    finish(code);
    return () => {
      cancelled = true;
    };
  }, [code, refresh, router]);

  if (error) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-card-foreground">Connexion interrompue</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Link href="/connexion" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">
          Retourner à la connexion
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Spinner className="size-6" />
      <p className="text-sm text-muted-foreground">Connexion en cours…</p>
    </div>
  );
}

export default function ExternalLoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8">
        <VextaLogo className="w-44" priority />
      </div>
      <Suspense fallback={<Spinner className="size-6" />}>
        <ExchangeCode />
      </Suspense>
    </div>
  );
}
