"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { NavItem } from "@/components/layout/nav-config";

export function NavLinks({
  items,
  onNavigate,
  collapsed = false,
}: {
  items: NavItem[];
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  const links = items.map((item) => {
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    const Icon = item.icon;
    const link = (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-label={collapsed ? item.label : undefined}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          collapsed && "justify-center px-2",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        )}
      >
        <Icon className="size-4 shrink-0" />
        {!collapsed && item.label}
      </Link>
    );

    if (!collapsed) return link;

    return (
      <Tooltip key={item.href}>
        <TooltipTrigger render={link} />
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  });

  return <nav className="flex flex-col gap-1">{links}</nav>;
}
