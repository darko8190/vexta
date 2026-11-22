import { NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { apiFetch, isUnreachable, UNREACHABLE_MESSAGE } from "@/lib/api-server";
import { API_UNREACHABLE_HEADER } from "@/lib/api-unreachable";

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

  // An API that answers 5xx is failing, not judging the session. It is reported exactly like an
  // unreachable one so the browser keeps the person where they are.
  if (response.status >= 500) {
    return NextResponse.json(
      { message: UNREACHABLE_MESSAGE },
      { status: 504, headers: { [API_UNREACHABLE_HEADER]: "1" } },
    );
  }

  if (!response.ok) {
    return NextResponse.json({ message: "Session invalide." }, { status: response.status });
  }

  const user = await response.json();
  return NextResponse.json({ user });
}
