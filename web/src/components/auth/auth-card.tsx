import Link from "next/link";
import { VextaLogo } from "@/components/brand/vexta-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * The centered card every screen outside the app wears: sign in, sign up, activate an access,
 * reset a password. No sidebar and no workspace switcher, because none of them exist yet for
 * whoever is reading — the only thing on the page is the one thing they came to do.
 */
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="vx-rise mb-8 flex flex-col items-center gap-2">
        <Link href="/" aria-label="Vexta — accueil" className="transition-opacity hover:opacity-70">
          <VextaLogo className="w-44" priority />
        </Link>
      </div>

      <div className="vx-rise vx-rise-late w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">{children}</div>
    </div>
  );
}
