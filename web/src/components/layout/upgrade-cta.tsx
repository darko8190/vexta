import Link from "next/link";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/** Shown where a personal space would otherwise see a create button. */
export function UpgradeCta({ className }: { className?: string }) {
  return (
    <Link href="/parametres" className={cn(buttonVariants({ variant: "outline" }), className)}>
      <Building2 />
      Passer à un compte entreprise
    </Link>
  );
}
