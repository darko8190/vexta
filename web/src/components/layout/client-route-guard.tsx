"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

/**
 * What a customer may open. Everything else belongs to the people who run the company.
 *
 * /profil is on the list because it is theirs, not the company's: it holds their name and the
 * button that resets their own password.
 */
const CLIENT_ROUTES = ["/tableau-de-bord", "/projets", "/factures", "/profil"];

/**
 * The sidebar already offers a customer only their own two modules, but a URL typed or kept in
 * a bookmark goes wherever it likes. The API refuses those modules with a 403; without this the
 * page would render its chrome and then sit there with nothing in it, which reads as a bug
 * rather than as a closed door.
 */
export function ClientRouteGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();

  if (user?.role !== "Client") return children;
  if (CLIENT_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return children;
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="size-4" />
          Section réservée
        </CardTitle>
        <CardDescription>Cette partie appartient à l&apos;équipe de {user.tenantName}.</CardDescription>
      </CardHeader>

      <CardContent className="text-sm text-muted-foreground">
        Vous avez accès à vos projets et à vos factures.
      </CardContent>

      <CardFooter>
        <Link href="/tableau-de-bord" className={cn(buttonVariants())}>
          Retour à mes dossiers
        </Link>
      </CardFooter>
    </Card>
  );
}
