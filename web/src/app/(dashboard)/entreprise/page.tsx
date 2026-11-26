"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";

/** The company card moved to the first section of Paramètres; old links and menus land there. */
export default function CompanyPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/parametres?section=entreprise");
  }, [router]);

  return <Spinner className="size-5" />;
}
