"use client";

import { useAuth } from "@/lib/auth-context";

/**
 * Creating records is reserved for business spaces. The API enforces it; this only keeps the
 * interface from offering a button that would be refused.
 */
export function useCanCreate() {
  const { user } = useAuth();
  return user?.tenantKind !== "Personal";
}
