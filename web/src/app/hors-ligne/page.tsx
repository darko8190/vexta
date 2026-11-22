import type { Metadata } from "next";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Hors ligne — Vexta",
};

/**
 * Served by the service worker when a navigation cannot reach the network.
 *
 * It says nothing about the data the person was after: Vexta reads everything from the API, and
 * nothing of it is kept on the device, so there is no stale version to offer. The honest answer
 * is that the connection is gone and the page will load again as soon as it is back.
 *
 * The retry is an ordinary link rather than a button: a plain navigation goes back through the
 * network, and a page served from a cache cannot count on its JavaScript having loaded.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md text-center">
        <p className="text-sm font-medium text-muted-foreground">Hors ligne</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Pas de connexion
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Vexta n&apos;a pas pu joindre le serveur. Vos clients, vos projets et vos factures sont
          intacts : ils vous attendent dès que le réseau revient.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Vérifiez le Wi-Fi ou les données mobiles, puis réessayez.
        </p>
        <a
          href="/tableau-de-bord"
          className={cn(buttonVariants({ variant: "outline" }), "mt-6 h-9 px-4")}
        >
          Réessayer
        </a>
      </div>
    </main>
  );
}
