/* eslint-disable @next/next/no-img-element -- see the note below: next/image caches by URL and
   cannot know the dimensions of artwork chosen at runtime. */
import { cn } from "@/lib/utils";

/**
 * The brand artwork, served by /branding/<slot> rather than imported from /public.
 *
 * That route resolves what the super admin uploaded, then the environment's URL, then the
 * bundled file — so changing the logo is a setting, not a deployment.
 *
 * These are plain <img> tags on purpose. next/image would route them through the optimiser,
 * which caches by URL and would keep serving the old artwork after an upload; and it cannot know
 * the dimensions of a file that is chosen at runtime. The width/height attributes below are the
 * bundled artwork's, used only as an aspect-ratio hint so the page does not jump while loading.
 */

const LOGO_RATIO = { width: 1536, height: 1024 };
const ICON_RATIO = { width: 500, height: 500 };

export function VextaLogo({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  // Both artworks are rendered and one is hidden by CSS rather than picked in JS: the theme
  // class lands on <html> before React hydrates, so there is never a frame with the wrong one.
  const common = "h-auto w-full";
  const loading = priority ? { loading: "eager" as const, fetchPriority: "high" as const } : {};

  return (
    <span className={cn("block", className)}>
      <img
        src="/branding/logo-light"
        alt="Vexta"
        {...LOGO_RATIO}
        {...loading}
        className={cn(common, "dark:hidden")}
      />
      <img
        src="/branding/logo-dark"
        alt="Vexta"
        {...LOGO_RATIO}
        {...loading}
        className={cn(common, "hidden dark:block")}
      />
    </span>
  );
}

/** The app icon. Self-contained artwork — it reads on either theme. */
export function VextaIcon({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <img
      src="/branding/icon"
      alt="Vexta"
      {...ICON_RATIO}
      {...(priority ? { loading: "eager" as const, fetchPriority: "high" as const } : {})}
      className={cn("size-8 rounded-lg object-contain", className)}
    />
  );
}

/** Horizontal lockup for bars that are too short for the stacked logo. */
export function VextaLockup({
  className,
  iconClassName,
  priority = false,
}: {
  className?: string;
  iconClassName?: string;
  priority?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <VextaIcon className={iconClassName} priority={priority} />
      <span className="text-lg font-semibold tracking-tight text-foreground">Vexta</span>
    </span>
  );
}
