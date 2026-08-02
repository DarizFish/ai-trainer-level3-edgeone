import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json(
      { database: "ok", status: "ready" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { database: "unavailable", status: "not_ready" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
