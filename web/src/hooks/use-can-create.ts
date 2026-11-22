"use client";

import { useAuth } from "@/lib/auth-context";

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
