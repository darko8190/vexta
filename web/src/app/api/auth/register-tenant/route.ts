import { NextRequest, NextResponse } from "next/server";
import { setToken } from "@/lib/session";
import { apiFetch, isUnreachable } from "@/lib/api-server";


export async function POST(request: NextRequest) {
  const body = await request.json();

  const response = await apiFetch("/api/auth/register-tenant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (isUnreachable(response)) return response;

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(data ?? { message: "Erreur lors de l'inscription." }, { status: response.status });
  }

  // A personal space is free, so the API returns a session instead of a Stripe URL: the cookie
  // is set here, server-side, exactly as it is on login.
  if (data?.session) {
    await setToken(data.session.accessToken);
    return NextResponse.json({ user: data.session.user });
  }

  return NextResponse.json({ checkoutUrl: data.checkoutUrl });
}
