import { sql } from "drizzle-orm";
import { withDbDeadline } from "@/db";
import { DATABASE_SCHEMA_VERSION } from "@/db/schema-version";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await withDbDeadline("health.ready", (db) => db.execute(sql`
      select hash, created_at
      from drizzle.__drizzle_migrations
      where created_at = ${DATABASE_SCHEMA_VERSION.createdAt}
    `));
    const current = result[0];
    if (
      current?.hash !== DATABASE_SCHEMA_VERSION.hash
      || Number(current?.created_at) !== DATABASE_SCHEMA_VERSION.createdAt
    ) {
      return Response.json(
        { database: "schema_mismatch", status: "not_ready" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      { database: "ok", schema: DATABASE_SCHEMA_VERSION.migration, status: "ready" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { database: "unavailable", status: "not_ready" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
