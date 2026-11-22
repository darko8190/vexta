import { Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";
import { CheckoutConfirmation } from "@/components/auth/checkout-confirmation";

export const metadata = { title: "Abonnement" };

export default function RegisterSuccessPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      {/* useSearchParams suspends, and the session id is the whole reason this page exists. */}
      <Suspense fallback={<Spinner className="size-8 text-muted-foreground" />}>
        <CheckoutConfirmation />
      </Suspense>
    </div>
  );
}
