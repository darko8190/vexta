import { NextRequest, NextResponse } from "next/server";
import { apiFetch, isUnreachable } from "@/lib/api-server";

/** Reads back the identity parked by the callback, so the company-name page can greet them. */
export async function GET(request: NextRequest) {
  const ticket = request.nextUrl.searchParams.get("ticket");
  if (!ticket) {
    return NextResponse.json({ message: "Billet manquant." }, { status: 400 });
  }

  const response = await apiFetch(
    `/api/auth/external/ticket?ticket=${encodeURIComponent(ticket)}`,
  );

  if (isUnreachable(response)) return response;

  const data = await response.json().catch(() => null);
  return NextResponse.json(data ?? { message: "Inscription expirée." }, { status: response.status });
}
