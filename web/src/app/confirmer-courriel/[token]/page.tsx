import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthCard } from "@/components/auth/auth-card";
import { ConfirmEmailPanel } from "@/components/auth/confirm-email-panel";

export const metadata = {
  title: "Confirmer mon adresse",
  // A private, single-use link: never indexed.
  robots: { index: false, follow: false },
};

/**
 * Pattern 3 — Form (auth). The end of the emailed confirmation link. Same shape as
 * /reinitialiser/[token]: params are read inside Suspense so the shell can prerender.
 */
async function ConfirmPanel({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ConfirmEmailPanel token={token} />;
}

export default function ConfirmEmailPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <AuthCard>
      <Suspense fallback={<Skeleton className="mx-auto h-24 w-full" />}>
        <ConfirmPanel params={params} />
      </Suspense>
    </AuthCard>
  );
}
