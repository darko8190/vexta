import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/session";
import { API_UNREACHABLE_HEADER, API_UNREACHABLE_MESSAGE } from "@/lib/api-unreachable";

/** Default deadline for a call to the .NET API. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Re-exported for the route handlers that already import it from here. */
export const UNREACHABLE_MESSAGE = API_UNREACHABLE_MESSAGE;

/**
 * Calls the .NET API with a deadline, and turns a failure to reach it into a 504 that the
 * route handler can return as-is.
 *
 * The deadline is the whole point. A dead API behind something that still accepts TCP
 * connections — the Aspire proxy in dev, a load balancer in production — leaves a bare
 * `fetch` waiting indefinitely, so pages sit on their loading skeletons forever and the
 * outage reads as a front-end bug.
 */
export async function apiFetch(
  path: string,
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    inheritCache = false,
    ...init
  }: RequestInit & { timeoutMs?: number; inheritCache?: boolean } = {},
): Promise<Response> {
  // Per-request data must never be cached, so no-store is the default.
  //
  // `inheritCache` is for a call made inside a "use cache" function, where the caching is the
  // enclosing boundary's job: under Cache Components an explicit `no-store` in there counts as
  // uncached data and Next refuses to prerender the route at all.
  const caching = inheritCache ? {} : { cache: "no-store" as RequestCache };

  try {
    return await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      ...caching,
      signal: AbortSignal.timeout(timeoutMs),
    } as RequestInit);
  } catch {
    return NextResponse.json(
      { message: UNREACHABLE_MESSAGE },
      { status: 504, headers: { [API_UNREACHABLE_HEADER]: "1" } },
    );
  }
}

/** True when `apiFetch` gave up, rather than the API having answered. */
export function isUnreachable(response: Response): boolean {
  return response.headers.get(API_UNREACHABLE_HEADER) === "1";
}
