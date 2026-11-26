"use client";

import { useAuth } from "@/lib/auth-context";
import { useViewMode } from "@/lib/view-mode";

/**
 * Creating records is reserved for the people who run a business space — not a personal space,
 * which is free and has no directory, and not a customer, who is there to read their own files.
 * The API enforces both; this only keeps the interface from offering a button that would be
 * refused.
 */
export function useCanCreate() {
  const { user } = useAuth();
  return user?.tenantKind !== "Personal" && user?.role !== "Client";
}

/**
 * A customer signed in to see their own files. Distinct from useCanCreate: both are refused the
 * create button, but only a personal space is offered an upgrade — telling a client to buy a
 * business plan would be addressing them as the wrong person entirely.
 */
export function useIsClientUser() {
  const { user } = useAuth();
  return user?.role === "Client";
}

/**
 * Whether this person may run the business rather than only work in it: an administrateur or a
 * chargé de projet, and a super admin who has entered the company.
 *
 * What it gates is the writing — creating a client, a project, a task, an invoice. An employee
 * still reads everything and still logs their own hours, expenses and tasks. The API enforces
 * this (Roles.Managers); this only keeps the interface from offering a button that would come
 * back 403.
 */
export function useCanManage() {
  const { user } = useAuth();
  // « Mode employé »: the management buttons step aside; the API still knows who this is.
  const viewMode = useViewMode();
  if (!user || viewMode === "employe") return false;

  return (
    user.role === "TenantAdmin" ||
    user.role === "ProjectManager" ||
    (user.role === "SuperAdmin" && user.isImpersonating)
  );
}

/**
 * The owner of the company, or a super admin standing in for them.
 *
 * Narrower than useCanManage: a chargé de projet decides what gets built, but who the company
 * will do business with at all — barring a client, barring their account — is not theirs. The
 * API enforces it (Roles.Owner); this keeps the interface from offering a 403.
 */
export function useIsOwner() {
  const { user } = useAuth();
  const viewMode = useViewMode();
  if (!user || viewMode === "employe") return false;

  return user.role === "TenantAdmin" || (user.role === "SuperAdmin" && user.isImpersonating);
}

/**
 * Whether the person sees the crew's application: an employee (TenantUser) in a company, or a
 * manager who switched to the employee view. The crew has no dashboard, no project list and no
 * tools: their day starts from their assignments.
 */
export function useIsCrewView() {
  const { user } = useAuth();
  const viewMode = useViewMode();
  if (!user || user.tenantKind === "Personal" || user.role === "Client") return false;
  if (user.role === "TenantUser") return true;
  if (user.role === "SuperAdmin" && !user.isImpersonating) return false;
  return viewMode === "employe";
}

/** Routes the crew does not open. A project's own page stays reachable from an assignment. */
export const CREW_HIDDEN_ROUTES = ["/tableau-de-bord", "/outils"];
export const CREW_HIDDEN_EXACT = ["/projets"];

export function isCrewHiddenRoute(pathname: string) {
  return (
    CREW_HIDDEN_EXACT.includes(pathname) ||
    CREW_HIDDEN_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))
  );
}
