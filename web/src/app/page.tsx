"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth-context";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/tableau-de-bord" : "/connexion");
  }, [loading, user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Spinner className="size-6" />
    </div>
  );
}
