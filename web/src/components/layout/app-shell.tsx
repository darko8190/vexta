"use client";

import { useState } from "react";
import Image from "next/image";
import { LogOut, Menu } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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

  if (!user) return null;

  const navItems = getNavItems(user.role);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-16 items-center px-5">
          <Image src="/vexta-logo.png" alt="Vexta" width={120} height={60} className="h-7 w-auto" />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <NavLinks items={navItems} />
        </div>
        <div className="border-t border-sidebar-border p-3">
          <UserMenu />
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 bg-sidebar p-0">
          <SheetTitle className="sr-only">Menu de navigation</SheetTitle>
          <div className="flex h-16 items-center px-5">
            <Image src="/vexta-logo.png" alt="Vexta" width={120} height={60} className="h-7 w-auto" />
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <NavLinks items={navItems} onNavigate={() => setMobileOpen(false)} />
          </div>
          <div className="border-t border-sidebar-border p-3">
            <UserMenu />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b border-border px-4 md:hidden">
          <Button variant="ghost" size="icon" aria-label="Ouvrir le menu" onClick={() => setMobileOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <Image src="/vexta-logo.png" alt="Vexta" width={100} height={50} className="h-6 w-auto" />
        </header>
        <main className="flex-1 overflow-x-hidden px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );

  function UserMenu() {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-sidebar-accent/60" />}
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-sidebar-accent text-xs text-sidebar-accent-foreground">
              {initials(user!.firstName, user!.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {user!.firstName} {user!.lastName}
            </p>
            <p className="truncate text-xs text-sidebar-foreground/60">{user!.tenantName ?? "Super Admin"}</p>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="truncate">{user!.email}</DropdownMenuLabel>
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
