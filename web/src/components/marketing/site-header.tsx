"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { VextaLockup } from "@/components/brand/vexta-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
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
      {/* The two outer cells grow equally, so the nav sits at the true centre of
          the bar instead of drifting with the width of the logo or the buttons. */}
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6 md:gap-8">
        <div className="flex flex-1 items-center">
          <Link
            href="/"
            aria-label="Vexta — accueil"
            className="flex items-center transition-opacity hover:opacity-70"
          >
            <VextaLockup iconClassName="size-7" priority />
          </Link>
        </div>

        <nav className="hidden shrink-0 items-center gap-6 md:flex">
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

        <div className="flex flex-1 items-center justify-end gap-2">
          <ThemeToggle />
          {loading ? null : user ? (
            <Link href="/tableau-de-bord" className={cn(buttonVariants(), "h-9 px-4")}>
              Mon espace
            </Link>
          ) : (
            <>
              {/* Hidden on phones so the bar fits 375px — the hero and the footer
                  both carry a "Se connecter" link. */}
              <Link
                href="/connexion"
                className={cn(buttonVariants({ variant: "ghost" }), "hidden h-9 px-3 sm:inline-flex")}
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
