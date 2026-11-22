import { NextRequest, NextResponse } from "next/server";
import { apiFetch, isUnreachable } from "@/lib/api-server";

/**
 * Asking for a reset link. Anonymous, so it cannot go through the proxy — there is no session
 * to forward, which is the whole point of the screen behind it.
 *
 * The API answers the same thing for a known and an unknown address, and this passes that
 * answer straight through rather than improving on it.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  const response = await apiFetch("/api/auth/mot-de-passe-oublie", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (isUnreachable(response)) return response;

  const data = await response.json().catch(() => null);

  return NextResponse.json(
    data ?? { message: "La demande n'a pas abouti. Réessayez." },
    { status: response.status },
  );
}
