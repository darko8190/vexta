import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Next's own 404 is in English and carries no branding, and this is the one route a stranger
 * reaches. They are told the page is not there and given somewhere to go, in French.
 */
export default function PublicCompanyNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md text-center">
        <p className="text-sm font-medium text-muted-foreground">Page introuvable</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Cette page n&apos;existe pas
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          L&apos;adresse est peut-être incomplète, ou l&apos;entreprise n&apos;a pas de page
          publique.
        </p>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "mt-6")}>
          Aller à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}
