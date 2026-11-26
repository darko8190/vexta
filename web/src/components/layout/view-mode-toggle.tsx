"use client";

import { useRouter } from "next/navigation";
import { HardHat, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth-context";
import { setViewMode, useViewMode } from "@/lib/view-mode";

/**
 * One press between admin and employee view, for the people who are both. Hidden for everyone
 * else: an employee has one view, and a customer or a personal space has nothing to switch.
 */
export function ViewModeToggle() {
  const { user } = useAuth();
  const mode = useViewMode();
  const router = useRouter();

  const managesForReal =
    user?.role === "TenantAdmin" || user?.role === "ProjectManager" || (user?.role === "SuperAdmin" && user.isImpersonating);
  if (!managesForReal || user?.tenantKind === "Personal") return null;

  const employee = mode === "employe";
  const label = employee ? "Passer en mode admin" : "Passer en mode employé";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={employee ? "default" : "ghost"}
            size="sm"
            aria-label={label}
            onClick={() => {
              setViewMode(employee ? "admin" : "employe");
              // Employee view opens on the day's work; admin view on the company.
              router.push(employee ? "/tableau-de-bord" : "/mes-assignations");
            }}
          />
        }
      >
        {employee ? <HardHat /> : <ShieldCheck />}
        <span className="hidden sm:inline">{employee ? "Mode employé" : "Mode admin"}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
