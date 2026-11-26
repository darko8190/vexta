import { NextRequest, NextResponse } from "next/server";
import { apiFetch, isUnreachable } from "@/lib/api-server";

/**
 * Applying an emailed confirmation link. Anonymous, like the password reset: the link may be
 * opened on a device where the person is not signed in, and the token is the proof.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  const response = await apiFetch("/api/auth/courriel/confirmer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (isUnreachable(response)) return response;

  const data = await response.json().catch(() => null);

  return NextResponse.json(
    data ?? { message: "La confirmation n'a pas abouti. Réessayez." },
    { status: response.status },
  );
}
