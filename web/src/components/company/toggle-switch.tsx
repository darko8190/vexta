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
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5",
        "transition-colors duration-150 outline-none motion-reduce:transition-none",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        // Off: a solid track with a border of its own. It used to be a translucent surface,
        // which in the dark theme was a dark shape on a dark card with a dark knob on it --
        // a control you could not tell the state of, on the one setting that decides whether
        // the company's page is on the internet.
        "border border-border bg-muted dark:border-input dark:bg-input",
        // On: the company's colour, and the dark variant repeated after it. Written once,
        // "dark:bg-input" won in the dark theme and the switch never looked switched.
        "data-checked:border-primary data-checked:bg-primary",
        "dark:data-checked:border-primary dark:data-checked:bg-primary",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          // White in both themes rather than the page background: against the dark track the
          // knob has to be the light thing, or there is nothing to see move.
          "block size-5 rounded-full bg-white shadow-sm ring-1 ring-black/10",
          "transition-transform duration-150 motion-reduce:transition-none",
          "data-checked:translate-x-5",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
