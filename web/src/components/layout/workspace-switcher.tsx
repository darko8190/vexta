"use client";

import { Briefcase, Check, ChevronsUpDown, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspacesQuery } from "@/hooks/use-workspaces";
import { useAuth } from "@/lib/auth-context";

/**
 * Which space you are working in, in the top bar rather than behind the avatar.
 *
 * It was in the profile menu, which put the single most consequential control in the
 * application — every list on every screen changes when this changes — two clicks deep and
 * beside "Se déconnecter". Worse, nothing on screen said which space you were in, so somebody
 * holding two companies had to open a menu to find out whose invoices they were reading.
 *
 * Now it says the answer without being opened, and it is still a menu rather than a toggle
 * because a person can belong to more than two spaces and a two-state switch could not say
 * which one.
 *
 * It renders nothing when there is only one space: a switcher that cannot switch is furniture,
 * and a bar that names "Acme Construction" to somebody who has only ever had Acme Construction
 * is a label, not a control.
 */
export function WorkspaceSwitcher() {
  const { user, enterWorkspace } = useAuth();

  // A super admin outside a tenant has no memberships, and one inside a tenant got there by
  // entering it, which is undone by leaving it — not by this.
  const applicable = Boolean(user) && user!.role !== "SuperAdmin" && !user!.isImpersonating;
  const { data: workspaces } = useWorkspacesQuery(applicable);

  if (!applicable || !workspaces || workspaces.length < 2) return null;

  const current = workspaces.find((workspace) => workspace.isCurrent);
  const label = current
    ? current.kind === "Personal"
      ? "Espace personnel"
      : current.name
    : "Changer d'espace";

  const CurrentIcon = current?.kind === "Personal" ? UserIcon : Briefcase;

  async function open(tenantId: string) {
    try {
      await enterWorkspace(tenantId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'ouvrir cet espace.");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            // The name is hidden below sm and the icon carries it: on a 375 px screen the bar
            // already holds the menu, the assistant, the theme and the avatar, and a company
            // name would push one of them off.
            className="max-w-[12rem] gap-2 px-2 sm:max-w-[16rem] sm:px-3"
            aria-label={`Espace : ${label}`}
          />
        }
      >
        <CurrentIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="hidden min-w-0 truncate text-sm font-medium sm:inline">{label}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Espaces
          </DropdownMenuLabel>
          {workspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace.tenantId}
              disabled={workspace.isCurrent}
              onClick={() => open(workspace.tenantId)}
            >
              {workspace.kind === "Personal" ? <UserIcon /> : <Briefcase />}
              <span className="truncate">
                {workspace.kind === "Personal" ? "Espace personnel" : workspace.name}
              </span>
              {workspace.isCurrent && <Check className="ml-auto size-4 text-muted-foreground" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
