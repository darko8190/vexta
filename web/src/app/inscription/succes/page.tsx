import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RegisterSuccessPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <CheckCircle2 className="size-12 text-primary" />
      <h1 className="text-xl font-semibold">Abonnement activé</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Votre paiement a été confirmé. Vous pouvez maintenant vous connecter à votre espace Vexta.
      </p>
      <Button render={<Link href="/connexion" />}>Se connecter</Button>
    </div>
  );
}
