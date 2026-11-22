"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Eye, LogOut, Settings, UserRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
import { VextaIcon, VextaLockup } from "@/components/brand/vexta-logo";
import { dashboardNavItem, getNavItems, type NavItem } from "@/components/layout/nav-config";
import { NavLinks } from "@/components/layout/nav-links";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { useNavigationQuery, type NavigationItem } from "@/hooks/use-navigation";
import { moduleIcon } from "@/lib/module-icons";
import { useAuth } from "@/lib/auth-context";

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

/** One level of nesting, flattened with a depth so a single list can render both. */
function flatten(items: NavigationItem[], depth = 0): NavItem[] {
  return items.flatMap((item) => [
    { href: item.href, label: item.title, icon: moduleIcon(item.icon), depth },
    ...flatten(item.children, depth + 1),
  ]);
}

/**
 * The sidebar: built from the modules this company's plan includes, or the built-in menu when
 * its plan defines none.
 *
 * The fallback is not a nicety. A company with no plan — every tenant created by hand — would
 * otherwise open to a sidebar with nothing in it and no way to reach anything.
 */
function useTenantNavItems(): NavItem[] {
  const { user } = useAuth();

  // Only a company's own menu comes from modules. A super admin outside a tenant, a customer and
  // a personal space each have a fixed one, and asking would be a refused request.
  const fromModules =
    Boolean(user) &&
    user!.role !== "Client" &&
    user!.tenantKind !== "Personal" &&
    (user!.role !== "SuperAdmin" || user!.isImpersonating);

  const { data } = useNavigationQuery(fromModules);
  const builtIn = getNavItems(user?.role, user?.isImpersonating, user?.tenantKind);

  if (!fromModules || !data || data.length === 0) return builtIn;

  return [dashboardNavItem, ...flatten(data)];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout, exitTenant } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Set the moment a destination is pressed, which drops the hover and focus rules below and
  // lets the panel fall shut over the page being opened. Cleared when the pointer leaves, so
  // the menu is ready to open again the next time it is approached.
  const [dismissed, setDismissed] = useState(false);

  // Before the early return: a hook cannot be called conditionally, and the shell renders
  // nothing until the session is known.
  const navItems = useTenantNavItems();

  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {user.isImpersonating && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary/30 bg-primary/10 px-4 py-2 md:px-6">
          <Eye className="size-4 shrink-0 text-primary" />
          <p className="text-sm text-foreground">
            Vous êtes dans <span className="font-medium">{user.tenantName}</span> en tant que super admin.
          </p>
          <Button variant="outline" size="sm" className="ml-auto" onClick={handleExitTenant}>
            Quitter le locataire
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
      {/* The rail keeps a fixed 64 px footprint in the layout. The panel inside it is absolute,
          so opening it draws over the page instead of pushing it: nothing the person was
          looking at moves, and the icons stay exactly where they were. */}
      <aside className="relative hidden w-16 shrink-0 md:block">
        <div
          className={cn(
            "group/sidebar absolute inset-y-0 left-0 z-30 flex w-16 flex-col overflow-hidden",
            "border-r border-sidebar-border bg-sidebar",
            "transition-[width,box-shadow] duration-200 ease-out motion-reduce:transition-none",
            // The short delay stops the menu flapping open every time the pointer crosses the
            // left edge on its way somewhere else. Closing is immediate, and keyboard focus
            // opens it at once because waiting for a Tab makes no sense.
            dismissed
              ? undefined
              : [
                  "hover:w-64 hover:shadow-xl hover:delay-100",
                  "focus-within:w-64 focus-within:shadow-xl focus-within:delay-0",
                ],
          )}
          onPointerLeave={() => setDismissed(false)}
        >
          <div className="flex h-16 shrink-0 items-center px-4">
            <Link
              href="/tableau-de-bord"
              aria-label="Vexta — tableau de bord"
              className="flex items-center gap-2 rounded-lg transition-opacity hover:opacity-70"
            >
              {/* size-8 at px-4 puts the mark's centre on the same vertical line as every nav
                  icon below it. */}
              <VextaIcon className="size-8 shrink-0" />
              {/* Faded rather than clipped: at 64 px the first letter would otherwise peek out
                  past the edge of the rail. */}
              <span className="whitespace-nowrap text-lg font-semibold tracking-tight text-foreground opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100 motion-reduce:transition-none">
                Vexta
              </span>
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-2">
            <NavLinks
              items={navItems}
              expandOnHover
              onNavigate={(event) => {
                // detail is 0 when the click came from Enter on a focused link. A keyboard user
                // keeps both the open menu and their place in it; a pointer user, who pressed
                // the thing they wanted, gets the page back.
                if (event.detail === 0) return;

                // Without this the link keeps focus and focus-within reopens the panel the
                // instant the pointer leaves it.
                event.currentTarget.blur();
                setDismissed(true);
              }}
            />
          </div>
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
              <VextaLockup iconClassName="size-7" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <NavLinks items={navItems} onNavigate={() => setMobileOpen(false)} />
          </div>
          {/* The invitation lives at the foot of the menu rather than in the header: the header
              has room for two controls on a phone, and installing is something you do once.
              It renders nothing at all when there is nothing to install. */}
          <div className="px-3 pb-4">
            <InstallPrompt className="w-full" />
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
            <VextaLockup iconClassName="size-7" />
          </button>
          <div className="flex-1" />
          <ThemeToggle />
          <UserAvatarMenu />
        </header>
        <header className="hidden h-16 items-center justify-end gap-2 border-b border-border px-6 md:flex">
          <InstallPrompt />
          <ThemeToggle />
          <UserAvatarMenu />
        </header>
        <main className="flex-1 overflow-x-hidden px-4 py-6 md:px-8 md:py-8">
          {/* No width cap: the tables are the point of most of these screens, and a column
              that has to truncate on a wide monitor is a column nobody can read. Forms keep
              their own max-width, so text lines stay short where it matters. */}
          <div className="w-full">{children}</div>
        </main>
      </div>
      </div>
    </div>
  );

  async function handleExitTenant() {
    try {
      await exitTenant();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de quitter ce locataire.");
    }
  }

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
          {/* Everyone has one, customers included: it is where the password is reset, and
              nobody should have to belong to a company to change their own password. */}
          <DropdownMenuGroup>
            <DropdownMenuItem render={<Link href="/profil" />}>
              <UserRound />
              Mon profil
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <WorkspaceSwitcher />
          <DropdownMenuSeparator />
          {/* Settings live here rather than in the sidebar: they are about the account, not a
              module you work in. */}
          {/* A super admin who has entered a tenant acts as its owner, so they get the owner's
              entries — the same rule the sidebar follows. Outside a tenant there is no company
              to show and no settings that apply. */}
          {/* A customer has no company card and no space settings of their own here. */}
          {user!.role !== "Client" && (user!.role !== "SuperAdmin" || user!.isImpersonating) && (
            <DropdownMenuGroup>
              {/* Also in the sidebar. It is here because this is where you look for "who am I
                  and what is my company", which is exactly what the card answers. A personal
                  space is not a company and has no such card. */}
              {user!.tenantKind !== "Personal" && (
                <DropdownMenuItem render={<Link href="/entreprise" />}>
                  <Building2 />
                  Fiche entreprise
                </DropdownMenuItem>
              )}
              <DropdownMenuItem render={<Link href="/parametres" />}>
                <Settings />
                Paramètres
              </DropdownMenuItem>
            </DropdownMenuGroup>
          )}
          <DropdownMenuGroup>
            <DropdownMenuItem variant="destructive" onClick={() => logout()}>
              <LogOut />
              Se déconnecter
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
}
