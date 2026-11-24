import { NextRequest, NextResponse } from "next/server";
import { apiFetch, isUnreachable } from "@/lib/api-server";

/**
 * One invoice, read by whoever holds its payment link.
 *
 * Its own route rather than the generic proxy, which refuses a call with no session — and the
 * caller here is a customer who has no account by definition. No token from a session is
 * forwarded: the API endpoint behind this is anonymous and decides for itself what the link in
 * the path is allowed to see.
 *
 * Nothing in the path is trusted. The token is passed on encoded and this file decides nothing.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const response = await apiFetch(`/api/public/factures/${encodeURIComponent(token)}`);
  if (isUnreachable(response)) return response;

  const text = await response.text();

  return new NextResponse(text || null, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}
