import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-server";

/**
 * The published plans, for the sign-up form. Public because the person choosing a plan has no
 * session yet; the generic /api/proxy route requires one.
 */
export async function GET() {
  const response = await apiFetch("/api/plans", { timeoutMs: 5_000 });

  if (!response.ok) {
    // An empty list makes the form say no plan is available, which beats a broken page.
    return NextResponse.json([]);
  }

  try {
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json([]);
  }
}
