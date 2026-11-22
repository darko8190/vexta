"use client";

import { Briefcase, Check, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { useWorkspacesQuery } from "@/hooks/use-workspaces";
import { useAuth } from "@/lib/auth-context";

/**
 * Personal mode and work mode, as one list rather than a toggle: a person can be an employee of
 * more than one company, and a two-state switch would have no way to say which one.
 *
 * It renders nothing when there is only one space — a switcher that cannot switch is furniture.
 */
export function WorkspaceSwitcher() {
  const { user, enterWorkspace } = useAuth();

  // A super admin outside a tenant has no memberships, and one inside a tenant got there by
  // entering it, which is undone by leaving it — not by this.
  const applicable = Boolean(user) && user!.role !== "SuperAdmin" && !user!.isImpersonating;
  const { data: workspaces } = useWorkspacesQuery(applicable);

  if (!applicable || !workspaces || workspaces.length < 2) return null;

  async function open(tenantId: string) {
    try {
      await enterWorkspace(tenantId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'ouvrir cet espace.");
    }
  }

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Espaces</DropdownMenuLabel>
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
  );
}
