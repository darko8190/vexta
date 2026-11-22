import { cookies } from "next/headers";

const COOKIE_NAME = "vexta_token";

/**
 * How long the session cookie survives, and with it the session.
 *
 * It must match Jwt:AccessTokenMinutes on the API (JwtOptions.cs): the cookie holds the token,
 * so whichever is shorter is the real limit, and a cookie that outlives its token only makes
 * the browser believe it is signed in until the next request says otherwise.
 *
 * Thirty days of *not opening Vexta*, not thirty days total: /api/auth/me slides the expiry
 * forward while the app is in use. Seven copies of this number used to sit in seven route
 * handlers, which is how a change like this one becomes a bug six months from now.
 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function getToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value;
}

export async function setToken(token: string, maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS) {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export async function clearToken() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export function apiBaseUrl(): string {
  return process.env.API_INTERNAL_URL ?? "http://localhost:5241";
}

/**
 * The URL the browser itself is sent to. Social sign-in is the one flow the browser cannot
 * proxy: Google redirects the browser, not our server, so the API's callback has to be
 * reachable from outside. In dev the internal URL already is.
 */
export function apiPublicUrl(): string {
  return process.env.API_PUBLIC_URL ?? apiBaseUrl();
}
