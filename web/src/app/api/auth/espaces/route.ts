import { NextRequest, NextResponse } from "next/server";
import { getToken, setToken } from "@/lib/session";
import { apiFetch, isUnreachable } from "@/lib/api-server";


/**
 * The spaces this person can work in, and the switch between them. It lives here rather than on
 * the generic proxy because switching returns a new token, and the token is a httpOnly cookie
 * the browser never touches: only a route handler can replace it.
 */
async function authorized() {
  const token = await getToken();
  return token
    ? { token, failure: null as null }
    : { token: null, failure: NextResponse.json({ message: "Non authentifié." }, { status: 401 }) };
}

export async function GET() {
  const { token, failure } = await authorized();
  if (failure) return failure;

  const response = await apiFetch("/api/auth/espaces", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (isUnreachable(response)) return response;

  const data = await response.json().catch(() => null);
  return NextResponse.json(data ?? [], { status: response.status });
}

export async function POST(request: NextRequest) {
  const { tenantId } = await request.json().catch(() => ({ tenantId: null }));
  if (!tenantId) {
    return NextResponse.json({ message: "Espace manquant." }, { status: 400 });
  }

  const { token, failure } = await authorized();
  if (failure) return failure;

  const response = await apiFetch(`/api/auth/espaces/${tenantId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (isUnreachable(response)) return response;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json(data ?? { message: "Changement d'espace impossible." }, { status: response.status });
  }

  await setToken(data.accessToken);
  return NextResponse.json({ user: data.user });
}
