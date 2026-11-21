import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { CATALOG_TAG } from "@/lib/catalog-cache";
import { getToken } from "@/lib/session";

/**
 * Purges the cached marketing page after the catalogue changes.
 *
 * The landing page caches its catalogue, otherwise every visitor costs an API round trip.
 * Without this, publishing a plan or a module would take up to five minutes to show, which
 * reads as the save having failed.
 *
 * Both calls are needed: the tag drops the cached catalogue itself, and the path drops the
 * rendered page that was built from it.
 */
export async function POST() {
  // Any signed-in user may purge a public cache; an anonymous caller may not. The action is
  // harmless beyond a wasted render, so this is about stopping idle churn, not protecting data.
  if (!(await getToken())) {
    return NextResponse.json({ message: "Non authentifié." }, { status: 401 });
  }

  revalidateTag(CATALOG_TAG, "max");
  revalidatePath("/");

  return NextResponse.json({ ok: true });
}
