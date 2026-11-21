import { NextRequest, NextResponse } from "next/server";
import { setToken } from "@/lib/session";
import { apiFetch, isUnreachable } from "@/lib/api-server";

const ACCESS_TOKEN_SECONDS = 60 * 60 * 12;

/** Finishes a provider sign-up: Stripe for a business space, a session for a free personal one. */
export async function POST(request: NextRequest) {
  const body = await request.json();

  const response = await apiFetch("/api/auth/external/register-tenant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (isUnreachable(response)) return response;

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(data ?? { message: "Erreur lors de l'inscription." }, { status: response.status });
  }

  if (data?.session) {
    await setToken(data.session.accessToken, ACCESS_TOKEN_SECONDS);
    return NextResponse.json({ user: data.session.user });
  }

  return NextResponse.json({ checkoutUrl: data.checkoutUrl });
}
