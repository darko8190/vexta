"use client";

import Link from "next/link";
import { FileUser, LogIn, UserPlus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

/**
 * Who is reading this company's page, and the way in for somebody who is not signed in.
 *
 * On the page rather than only inside the apply dialog: applying needs an account, and finding
 * that out only after pressing Postuler is finding it out too late. The two buttons say what
 * the page expects of a visitor before they commit to anything.
 *
 * Both carry a return path, so signing in or opening an account brings somebody back to the
 * posting they were reading instead of to a dashboard they did not ask for.
 */
export function PublicAccountBar({ slug }: { slug: string }) {
  const { user, loading } = useAuth();
  const back = `/e/${encodeURIComponent(slug)}`;

  if (loading) return <Skeleton className="h-9 w-40" />;

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden text-sm text-muted-foreground sm:inline">
          {user.firstName} {user.lastName}
        </span>
        <Link href="/mon-cv" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <FileUser className="size-4" />
          Mon CV
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/connexion?retour=${encodeURIComponent(back)}`}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
      >
        <LogIn className="size-4" />
        Se connecter
      </Link>
      <Link
        href={`/inscription?type=personnel&retour=${encodeURIComponent(back)}`}
        className={cn(buttonVariants({ size: "sm" }))}
      >
        <UserPlus className="size-4" />
        S&apos;inscrire
      </Link>
    </div>
  );
}

/**
 * The same two doors, said as a sentence, for inside the apply dialog.
 *
 * A separate component because the wording has to differ: here the person has already pressed
 * Postuler, so the message is about what is in the way rather than about what the page offers.
 */
export function SignInToApply({ slug }: { slug: string }) {
  return (
    <SignInPrompt slug={slug}>
      Postuler demande un compte Vexta — gratuit, et c&apos;est lui qui garde votre CV pour les
      prochaines offres plutôt que de vous le faire réécrire chaque fois.
    </SignInPrompt>
  );
}

/**
 * Ordering also needs an account, and for its own reason: an order is a commitment both ways,
 * and it is what makes "Mes commandes" possible for somebody who buys from four suppliers.
 */
export function SignInToOrder({ slug }: { slug: string }) {
  return (
    <SignInPrompt slug={slug}>
      Commander demande un compte Vexta — gratuit, et c&apos;est lui qui vous montre où en sont
      vos commandes chez toutes les entreprises, plutôt que de vous faire fouiller vos courriels.
    </SignInPrompt>
  );
}

/**
 * The two buttons, with whatever reason the caller has for showing them.
 *
 * One component rather than two nearly identical ones: the return address and the wording of
 * the links are the same everywhere, and the only thing that differs is the sentence above
 * them — which is exactly the part each caller should own.
 */
function SignInPrompt({ slug, children }: { slug: string; children: React.ReactNode }) {
  const back = `/e/${encodeURIComponent(slug)}`;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{children}</p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/inscription?type=personnel&retour=${encodeURIComponent(back)}`}
          className={cn(buttonVariants())}
        >
          <UserPlus className="size-4" />
          Créer mon compte
        </Link>
        <Link
          href={`/connexion?retour=${encodeURIComponent(back)}`}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          <LogIn className="size-4" />
          J&apos;ai déjà un compte
        </Link>
      </div>
    </div>
  );
}

/** Shown when the account exists but the CV is not enough to apply with yet. */
export function CompleteCvToApply({ missing }: { missing: string[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Il manque {missing.join(" et ")} à votre CV. Un employeur doit pouvoir vous joindre et
        savoir ce que vous avez fait.
      </p>
      <Button render={<Link href="/mon-cv" />}>
        <FileUser className="size-4" />
        Compléter mon CV
      </Button>
    </div>
  );
}
