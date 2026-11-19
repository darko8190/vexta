import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The stacked logo exists in a dark and a light artwork. Both are rendered and one is
 * hidden by CSS rather than picked in JS: the theme class lands on <html> before React
 * hydrates, so there is never a frame with the wrong artwork.
 */
export function VextaLogo({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  const common = "h-auto w-full";
  return (
    <span className={cn("block", className)}>
      <Image
        src="/vexta-logo-light.png"
        alt="Vexta"
        width={1536}
        height={1024}
        priority={priority}
        className={cn(common, "dark:hidden")}
      />
      <Image
        src="/vexta-logo-dark.png"
        alt="Vexta"
        width={1536}
        height={1024}
        priority={priority}
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
    <Image
      src="/vexta-icon.png"
      alt="Vexta"
      width={500}
      height={500}
      priority={priority}
      className={cn("size-8 rounded-lg", className)}
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
