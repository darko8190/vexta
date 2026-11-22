"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { API_UNREACHABLE_HEADER } from "@/lib/api-unreachable";
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
  /**
   * True when the last session check could not reach the API at all. Distinct from `user` being
   * null, which means the session really has ended: an outage must not be read as a sign-out.
   */
  unreachable: boolean;
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

/**
 * What a session check can come back with. Three outcomes, not two: signed in, signed out, and
 * "could not ask" — which is the one that used to be mistaken for signed out.
 *
 * A plain async function rather than inline code in the provider, so every state write below
 * happens after an await. `fetch` can throw synchronously, and a setState reached in the same
 * tick as the effect that triggered it is a cascading render the React Compiler refuses.
 */
type SessionRead =
  | { kind: "signed-in"; user: User }
  | { kind: "signed-out" }
  | { kind: "unreachable" };

async function readSession(): Promise<SessionRead> {
  try {
    const response = await fetch("/api/auth/me", { cache: "no-store" });

    if (response.ok) {
      const data = (await response.json()) as { user: User };
      return { kind: "signed-in", user: data.user };
    }

    // The route handler already tells an outage apart from a dead session; this is where that
    // distinction has to survive. Reading its 504 as "signed out" is what logged people out on
    // refresh every time the back end restarted — on every deploy, and on any hiccup.
    if (response.headers.get(API_UNREACHABLE_HEADER) === "1") return { kind: "unreachable" };

    return { kind: "signed-out" };
  } catch {
    // fetch itself failing is the same thing: the browser is offline, not signed out.
    return { kind: "unreachable" };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  const applySession = useCallback((result: SessionRead) => {
    // An outage keeps whatever session is already on screen: what is wrong is the connection.
    if (result.kind === "unreachable") {
      setUnreachable(true);
    } else {
      setUser(result.kind === "signed-in" ? result.user : null);
      setUnreachable(false);
    }

    setLoading(false);
  }, []);

  const refresh = useCallback(
    () => readSession().then(applySession),
    [applySession],
  );

  // Read once on mount, and written only from the callback — an answer that arrives after this
  // provider has gone, or after someone has signed in by hand in the meantime, is dropped
  // rather than overwriting the newer state.
  useEffect(() => {
    let alive = true;

    readSession().then((result) => {
      if (alive) applySession(result);
    });

    return () => {
      alive = false;
    };
  }, [applySession]);

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
      value={{
        user,
        loading,
        unreachable,
        login,
        registerTenant,
        logout,
        refresh,
        enterTenant,
        exitTenant,
        enterWorkspace,
      }}
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
