"use client";

import { useState } from "react";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getNavItems } from "@/components/layout/nav-config";
import { NavLinks } from "@/components/layout/nav-links";
import { useAuth } from "@/lib/auth-context";

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);

  if (!user) return null;

  const navItems = getNavItems(user.role);

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-150 md:flex",
          desktopSidebarOpen ? "w-64" : "w-16",
        )}
      >
        <div className={cn("flex h-16 items-center", desktopSidebarOpen ? "px-5" : "justify-center px-2")}>
          <button
            type="button"
            aria-label={desktopSidebarOpen ? "Fermer le menu" : "Ouvrir le menu"}
            onClick={() => setDesktopSidebarOpen((open) => !open)}
            className="flex items-center rounded-lg transition-opacity hover:opacity-70"
          >
            {desktopSidebarOpen ? (
              <Image src="/vexta-logo.png" alt="Vexta" width={120} height={60} className="h-7 w-auto" />
            ) : (
              <Image src="/vexta-icon.png" alt="Vexta" width={28} height={28} className="size-7" />
            )}
          </button>
        </div>
        <div className={cn("flex-1 overflow-y-auto py-2", desktopSidebarOpen ? "px-3" : "px-2")}>
          <NavLinks items={navItems} collapsed={!desktopSidebarOpen} />
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 bg-sidebar p-0">
          <SheetTitle className="sr-only">Menu de navigation</SheetTitle>
          <div className="flex h-16 items-center px-5">
            <button
              type="button"
              aria-label="Fermer le menu"
              onClick={() => setMobileOpen(false)}
              className="flex items-center rounded-lg transition-opacity hover:opacity-70"
            >
              <Image src="/vexta-logo.png" alt="Vexta" width={120} height={60} className="h-7 w-auto" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <NavLinks items={navItems} onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b border-border px-4 md:hidden">
          <button
            type="button"
            aria-label="Ouvrir le menu"
            onClick={() => setMobileOpen(true)}
            className="flex items-center rounded-lg transition-opacity hover:opacity-70"
          >
            <Image src="/vexta-logo.png" alt="Vexta" width={100} height={50} className="h-6 w-auto" />
          </button>
          <div className="flex-1" />
          <UserAvatarMenu />
        </header>
        <header className="hidden h-16 items-center justify-end border-b border-border px-6 md:flex">
          <UserAvatarMenu />
        </header>
        <main className="flex-1 overflow-x-hidden px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );

  function UserAvatarMenu() {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<button aria-label="Menu utilisateur" className="rounded-full" />}>
          <Avatar className="size-9">
            <AvatarFallback className="bg-sidebar-accent text-xs text-sidebar-accent-foreground">
              {initials(user!.firstName, user!.lastName)}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <p className="truncate font-medium text-foreground">
                {user!.firstName} {user!.lastName}
              </p>
              <p className="truncate text-xs font-normal text-muted-foreground">{user!.email}</p>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem variant="destructive" onSelect={() => logout()}>
              <LogOut />
              Se déconnecter
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
}
