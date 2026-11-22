"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@/lib/types";

interface RegisterTenantInput {
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  kind: "Business" | "Personal";
  /** Null for a personal space: it is free and has no plan. */
  planId: string | null;
}

/** A business sign-up goes to Stripe; a free personal one comes back already signed in. */
type RegisterTenantResult = { checkoutUrl: string; user?: never } | { user: User; checkoutUrl?: never };

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  registerTenant: (input: RegisterTenantInput) => Promise<RegisterTenantResult>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  enterTenant: (tenantId: string) => Promise<void>;
  exitTenant: () => Promise<void>;
  /** Switches to another space this person belongs to — personal or a company. */
  enterWorkspace: (tenantId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const queryClient = useQueryClient();

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message ?? "Courriel ou mot de passe invalide.");
    }
    setUser(data.user);
  }, []);

  const registerTenant = useCallback(async (input: RegisterTenantInput) => {
    const response = await fetch("/api/auth/register-tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message ?? "Erreur lors de l'inscription.");
    }
    // A free sign-up already holds a session cookie, so adopt the user straight away.
    if (data?.user) setUser(data.user as User);
    return data as RegisterTenantResult;
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    queryClient.clear();
    router.push("/connexion");
  }, [queryClient, router]);

  // Entering or leaving a tenant swaps the token, so every cached query belongs to the old
  // context and has to go.
  const enterTenant = useCallback(async (tenantId: string) => {
    const response = await fetch("/api/auth/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message ?? "Impossible d'entrer dans ce locataire.");
    }
    queryClient.clear();
    setUser(data.user);
    router.push("/tableau-de-bord");
  }, [queryClient, router]);

  const exitTenant = useCallback(async () => {
    const response = await fetch("/api/auth/impersonate", { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message ?? "Impossible de quitter ce locataire.");
    }
    queryClient.clear();
    setUser(data.user);
    router.push("/admin/tenants");
  }, [queryClient, router]);

  // Same reason as entering a tenant: the token changes, so everything cached was read in the
  // space being left. Sending the person to the dashboard also avoids landing them on a page
  // the new space does not have.
  const enterWorkspace = useCallback(async (tenantId: string) => {
    const response = await fetch("/api/auth/espaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message ?? "Impossible d'ouvrir cet espace.");
    }
    queryClient.clear();
    setUser(data.user);
    router.push("/tableau-de-bord");
  }, [queryClient, router]);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, registerTenant, logout, refresh, enterTenant, exitTenant, enterWorkspace }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans un AuthProvider.");
  return ctx;
}
