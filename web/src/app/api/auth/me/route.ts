import { NextResponse } from "next/server";
import { getToken, setToken } from "@/lib/session";
import { apiFetch, isUnreachable, UNREACHABLE_MESSAGE } from "@/lib/api-server";
import { API_UNREACHABLE_HEADER } from "@/lib/api-unreachable";

/** Set by the API when it issues a renewed token — see AuthHeaders.cs. */
const RENEWED_TOKEN_HEADER = "x-vexta-renewed-token";

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

  // The API slides the session forward while the app is in use and hands back a fresh token
  // when it does. Only this server can act on that: the cookie is httpOnly, so the browser
  // cannot rewrite it, and nothing else in the app asks "am I still signed in?" often enough
  // to be the place where a session gets renewed.
  const renewed = response.headers.get(RENEWED_TOKEN_HEADER);
  if (renewed) await setToken(renewed);

  const user = await response.json();
  return NextResponse.json({ user });
}
