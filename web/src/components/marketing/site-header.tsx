"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

const sections = [
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#tarif", label: "Tarif" },
  { href: "#faq", label: "FAQ" },
];

export function SiteHeader() {
  const { user, loading } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6 md:gap-8">
        <Link
          href="/"
          aria-label="Vexta — accueil"
          className="flex items-center transition-opacity hover:opacity-70"
        >
          <Image src="/vexta-logo.png" alt="Vexta" width={120} height={60} priority className="h-7 w-auto" />
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {section.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {loading ? null : user ? (
            <Link href="/tableau-de-bord" className={cn(buttonVariants(), "h-9 px-4")}>
              Mon espace
            </Link>
          ) : (
            <>
              <Link
                href="/connexion"
                className={cn(buttonVariants({ variant: "ghost" }), "h-9 px-3")}
              >
                Se connecter
              </Link>
              <Link href="/inscription" className={cn(buttonVariants(), "h-9 px-4")}>
                Créer un compte
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
