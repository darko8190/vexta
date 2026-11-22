import { NextRequest, NextResponse } from "next/server";
import { apiFetch, isUnreachable } from "@/lib/api-server";

/**
 * Its own route rather than the usual proxy, which requires a session. Someone coming back from
 * Stripe after signing up has no session yet — that is the whole point of this call.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const response = await apiFetch("/api/billing/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: body?.sessionId ?? null }),
  });

  if (isUnreachable(response)) return response;

  const data = await response.json().catch(() => null);
  return NextResponse.json(data ?? { message: "Confirmation impossible." }, { status: response.status });
}
