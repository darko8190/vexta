import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-server";

/**
 * Which providers this deployment has credentials for. Empty means "hide the buttons".
 *
 * The deadline is short on purpose: these buttons are decoration until the API answers,
 * and the sign-in form behind them must not wait on them.
 */
export async function GET() {
  const response = await apiFetch("/api/auth/external/providers", { timeoutMs: 2_500 });

  // A social button that cannot work is worse than no button, so any failure — including an
  // API that never answered — hides them.
  if (!response.ok) return NextResponse.json([]);

  try {
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json([]);
  }
}
