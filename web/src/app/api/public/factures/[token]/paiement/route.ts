import { NextRequest, NextResponse } from "next/server";
import { apiFetch, isUnreachable } from "@/lib/api-server";

/**
 * Starts the card payment for one invoice and relays Stripe's hosted page back.
 *
 * No body is forwarded, and that is deliberate: the amount is the API's to work out from the
 * invoice and what has already been paid against it. A caller able to name its own figure could
 * settle a four-thousand-dollar invoice for a dollar.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const response = await apiFetch(`/api/public/factures/${encodeURIComponent(token)}/paiement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

  if (isUnreachable(response)) return response;

  const text = await response.text();

  return new NextResponse(text || null, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}
