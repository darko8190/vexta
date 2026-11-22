import { NextRequest, NextResponse } from "next/server";
import { apiFetch, isUnreachable } from "@/lib/api-server";

/**
 * Setting the new password from an emailed link.
 *
 * No session is opened on success: the person types the password they have just chosen on the
 * sign-in page. Signing them in here would mean whoever holds the link gets the session, and a
 * link that reached the wrong inbox should cost a password, not an account.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  const response = await apiFetch("/api/auth/reinitialiser-mot-de-passe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (isUnreachable(response)) return response;

  const data = await response.json().catch(() => null);

  return NextResponse.json(
    data ?? { message: "Le changement n'a pas abouti. Réessayez." },
    { status: response.status },
  );
}
