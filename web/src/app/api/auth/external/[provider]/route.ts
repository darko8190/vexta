import { NextRequest, NextResponse } from "next/server";
import { apiPublicUrl } from "@/lib/session";

const allowed = ["Google", "Microsoft"];

/**
 * Sends the browser off to the API's challenge endpoint. It exists so the API's address stays
 * a server-side setting instead of being baked into the client bundle.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const match = allowed.find((name) => name.toLowerCase() === provider.toLowerCase());

  if (!match) {
    return NextResponse.redirect(new URL("/connexion?erreur=fournisseur-inconnu", _request.url));
  }

  return NextResponse.redirect(`${apiPublicUrl()}/api/auth/external/${match}/start`);
}
