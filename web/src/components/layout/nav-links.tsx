"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import type { NavItem } from "@/components/layout/nav-config";

export function NavLinks({
  items,
  onNavigate,
  expandOnHover = false,
}: {
  items: NavItem[];
  onNavigate?: () => void;
  /** Rows start icon-width and grow with the sidebar panel around them. */
  expandOnHover?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              // h-10 and px-3 are what hold the icon still. The row is the same height and the
              // icon the same distance from the edge whether the panel is 64 or 256 px wide, so
              // someone who knows where an icon lives can keep clicking it as the menu opens.
              // Without the fixed height, a label's line box makes open rows 4 px taller than
              // closed ones and every icon below the first drifts down.
              "flex h-10 shrink-0 items-center gap-3 overflow-hidden rounded-lg px-3",
              "text-sm font-medium",
              "transition-[width,background-color,color] duration-200 ease-out motion-reduce:transition-none",
              // w-10 leaves exactly the icon between the two paddings; the label is clipped
              // rather than removed, so it is still read out and nothing reflows on open.
              expandOnHover
                ? "w-10 group-hover/sidebar:w-full group-focus-within/sidebar:w-full"
                : "w-full",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
