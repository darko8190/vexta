"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  );
}

const providers = [
  { id: "Google", label: "Google", icon: GoogleIcon },
  { id: "Microsoft", label: "Microsoft", icon: MicrosoftIcon },
];

/**
 * Renders nothing until it knows which providers are configured — a button that leads to a
 * dead end is worse than no button at all.
 */
export function SocialButtons({ action }: { action: "login" | "signup" }) {
  const [available, setAvailable] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/external/providers", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((list) => {
        if (!cancelled) setAvailable(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setAvailable([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = providers.filter((provider) => available?.includes(provider.id));
  if (shown.length === 0) return null;

  const verb = action === "login" ? "Se connecter avec" : "S'inscrire avec";

  return (
    <div className="mb-6">
      <div className="grid gap-2">
        {shown.map((provider) => (
          <a
            key={provider.id}
            href={`/api/auth/external/${provider.id.toLowerCase()}`}
            className={cn(buttonVariants({ variant: "outline" }), "h-10 w-full gap-2")}
          >
            <provider.icon />
            {verb} {provider.label}
          </a>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">ou</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
