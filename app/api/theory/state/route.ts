import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { favorites, theoryProgress } from "@/db/schema";
import { requireApiUser, unauthorized } from "@/lib/server-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const db = getDb();
  const [favoriteRows, wrongRows] = await Promise.all([
    db
      .select({ id: favorites.itemId })
      .from(favorites)
      .where(and(
        eq(favorites.email, user.email),
        eq(favorites.itemType, "theory"),
        eq(favorites.active, true),
      )),
    db
      .select({ id: theoryProgress.questionId })
      .from(theoryProgress)
      .where(and(
        eq(theoryProgress.email, user.email),
        eq(theoryProgress.correct, false),
      )),
  ]);

  return Response.json({
    favoriteIds: favoriteRows.map(({ id }) => id),
    wrongIds: wrongRows.map(({ id }) => id),
  });
}
