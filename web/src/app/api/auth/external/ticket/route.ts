import { NextRequest, NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/session";

/** Reads back the identity parked by the callback, so the company-name page can greet them. */
export async function GET(request: NextRequest) {
  const ticket = request.nextUrl.searchParams.get("ticket");
  if (!ticket) {
    return NextResponse.json({ message: "Billet manquant." }, { status: 400 });
  }

  const response = await fetch(
    `${apiBaseUrl()}/api/auth/external/ticket?ticket=${encodeURIComponent(ticket)}`,
    { cache: "no-store" },
  );

  const data = await response.json().catch(() => null);
  return NextResponse.json(data ?? { message: "Inscription expirée." }, { status: response.status });
}
