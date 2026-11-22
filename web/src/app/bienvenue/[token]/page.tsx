import { Suspense } from "react";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { VextaLogo } from "@/components/brand/vexta-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AcceptInvitationForm } from "@/components/team/accept-invitation-form";
import { apiFetch, isUnreachable } from "@/lib/api-server";
import type { Invitation } from "@/lib/types";

export const metadata = {
  title: "Activer votre accès",
  // An invitation link is private: it must never end up in a search index.
  robots: { index: false, follow: false },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="mb-8 flex flex-col items-center gap-2">
        <Link href="/" aria-label="Vexta — accueil" className="transition-opacity hover:opacity-70">
          <VextaLogo className="w-44" priority />
        </Link>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">{children}</div>
    </div>
  );
}

function Unusable({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-destructive/10">
        <CircleAlert className="size-5 text-destructive" />
      </div>
      <h1 className="text-xl font-semibold text-card-foreground">Lien inutilisable</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <Link
        href="/connexion"
        className="mt-6 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Aller à la connexion
      </Link>
    </div>
  );
}

function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="mx-auto h-6 w-40" />
      <Skeleton className="mx-auto h-4 w-56" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

/**
 * The lookup lives in here, inside Suspense, rather than in the page body.
 *
 * The token is single use and personal, so this call must never be cached — which under Cache
 * Components leaves exactly one way to render the route: stream it. The branded shell paints
 * immediately and only the card waits.
 */
async function InvitationPanel({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const response = await apiFetch(`/api/invitations/${encodeURIComponent(token)}`);

  if (isUnreachable(response)) {
    return <Unusable message="Le service est momentanément injoignable. Réessayez dans un instant." />;
  }

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { message?: string } | null;
    return (
      <Unusable message={data?.message ?? "Cette invitation n'existe pas, a expiré, ou a déjà été utilisée."} />
    );
  }

  const invitation = (await response.json()) as Invitation;

  return (
    <>
      <h1 className="text-center text-xl font-semibold text-card-foreground">
        Bienvenue, {invitation.firstName}
      </h1>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        {invitation.tenantName
          ? `Choisissez votre mot de passe pour accéder à ${invitation.tenantName}.`
          : "Choisissez votre mot de passe pour activer votre accès."}
      </p>

      <AcceptInvitationForm token={token} email={invitation.email} />
    </>
  );
}

// Sync on purpose: awaiting params here would make the whole route dynamic again. The promise
// is forwarded into the suspended child, which is where it may safely be awaited.
export default function WelcomePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Shell>
      <Suspense fallback={<Loading />}>
        <InvitationPanel params={params} />
      </Suspense>
    </Shell>
  );
}
