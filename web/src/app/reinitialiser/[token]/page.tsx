import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = {
  title: "Nouveau mot de passe",
  // A reset link is private and single use: it must never end up in a search index.
  robots: { index: false, follow: false },
};

function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="mx-auto h-6 w-48" />
      <Skeleton className="mx-auto h-4 w-56" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

/**
 * Pattern 3 — Form (auth). The end of the emailed link.
 *
 * The token is read in here, inside Suspense, rather than in the page body. Under Cache
 * Components a route that touches its own params outside a boundary cannot be prerendered at
 * all — the build refuses it — so the branded shell paints immediately and only the card waits.
 * The same shape as /bienvenue/[token], for the same reason.
 */
async function ResetPanel({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ResetPasswordForm token={token} />;
}

// Sync on purpose: awaiting params here would put the whole route back outside the boundary.
// The promise is forwarded into the suspended child, which is where it may safely be awaited.
export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <AuthCard>
      <Suspense fallback={<Loading />}>
        <ResetPanel params={params} />
      </Suspense>
    </AuthCard>
  );
}
