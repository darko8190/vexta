"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

/**
 * The way back to Vexta from a company's page, for somebody who came from their own space.
 *
 * The company's page is outside the app — it has no sidebar — so without this the only way back
 * is the browser's own button, which a phone in standalone mode does not even have. Back in
 * history when they arrived from inside Vexta, which returns them to the list they were reading
 * with its search intact; to the directory otherwise, when the page was opened from a link.
 *
 * Only for a signed-in visitor: a stranger who landed here from a search engine has nowhere in
 * Vexta to go back to.
 */
export function PublicBackLink() {
  const { user, loading } = useAuth();
  const router = useRouter();

  if (loading || !user) return null;

  function goBack() {
    const fromVexta =
      typeof document !== "undefined" &&
      document.referrer.startsWith(window.location.origin) &&
      window.history.length > 1;

    if (fromVexta) router.back();
    else router.push("/entreprises");
  }

  return (
    <Button variant="ghost" size="sm" onClick={goBack}>
      <ArrowLeft className="size-4" />
      Retour
    </Button>
  );
}
