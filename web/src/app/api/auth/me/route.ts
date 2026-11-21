import { NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { apiFetch, isUnreachable } from "@/lib/api-server";

export async function GET() {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ message: "Non authentifié." }, { status: 401 });
  }

  const response = await apiFetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });

  // An unreachable API is not an invalid session: saying so would sign the person out
  // of a perfectly good session every time the back end hiccups.
  if (isUnreachable(response)) return response;

  if (!response.ok) {
    return NextResponse.json({ message: "Session invalide." }, { status: response.status });
  }

  const user = await response.json();
  return NextResponse.json({ user });
}
