import { NextResponse } from "next/server";
import { connection } from "next/server";
import { apiPublicUrl } from "@/lib/session";

/**
 * The address an outside system points its MCP client at. Only the server knows the API's
 * public domain, so the settings screen asks here rather than guessing it.
 */
export async function GET() {
  await connection();
  return NextResponse.json({ url: `${apiPublicUrl().replace(/\/$/, "")}/api/mcp` });
}
