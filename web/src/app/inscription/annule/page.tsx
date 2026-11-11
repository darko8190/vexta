import Link from "next/link";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RegisterCancelledPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <XCircle className="size-12 text-destructive" />
      <h1 className="text-xl font-semibold">Paiement annulé</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Votre abonnement n&apos;a pas été activé. Vous pouvez réessayer à tout moment.
      </p>
      <Button render={<Link href="/inscription" />}>Réessayer</Button>
    </div>
  );
}
