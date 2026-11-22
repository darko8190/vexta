"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";

/**
 * A switch, for the one setting in the application that is a state rather than a value: the
 * public page is either on or off, and a checkbox labelled "Publiée" reads as something that
 * will take effect once the form is saved. This takes effect when it is flipped.
 */
export function ToggleSwitch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent p-0.5",
        "bg-input transition-colors duration-150 outline-none motion-reduce:transition-none",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-checked:bg-primary dark:bg-input/60",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block size-5 rounded-full bg-background shadow-sm",
          "transition-transform duration-150 motion-reduce:transition-none",
          "data-checked:translate-x-4",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
