import { NextRequest, NextResponse } from "next/server";
import { setToken } from "@/lib/session";
import { apiFetch, isUnreachable } from "@/lib/api-server";

const ACCESS_TOKEN_SECONDS = 60 * 60 * 12;

/**
 * Accepting lands the employee straight in their space. Signing them in here rather than
 * bouncing them to the login form means they type their new password once, not twice.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await request.json();

  const response = await apiFetch(`/api/invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (isUnreachable(response)) return response;

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(data ?? { message: "Impossible d'activer cet accès." }, { status: response.status });
  }

  await setToken(data.accessToken, ACCESS_TOKEN_SECONDS);
  return NextResponse.json({ user: data.user });
}
