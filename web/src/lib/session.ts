import { cookies } from "next/headers";

const COOKIE_NAME = "vexta_token";

export async function getToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value;
}

export async function setToken(token: string, maxAgeSeconds: number) {
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
