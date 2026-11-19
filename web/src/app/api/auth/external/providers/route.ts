import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/session";

/** Which providers this deployment has credentials for. Empty means "hide the buttons". */
export async function GET() {
  try {
    const response = await fetch(`${apiBaseUrl()}/api/auth/external/providers`, {
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json([]);
    return NextResponse.json(await response.json());
  } catch {
    // A social button that cannot work is worse than no button, so a failure here hides them.
    return NextResponse.json([]);
  }
}
