import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { favorites, theoryProgress } from "@/db/schema";
import { requireApiUser, unauthorized } from "@/lib/server-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const db = getDb();
  const [favoriteRows, progressRows] = await Promise.all([
    db
      .select({ id: favorites.itemId })
      .from(favorites)
      .where(and(
        eq(favorites.email, user.email),
        eq(favorites.itemType, "theory"),
        eq(favorites.active, true),
      )),
    db
      .select({
        id: theoryProgress.questionId,
        answerJson: theoryProgress.answerJson,
        correct: theoryProgress.correct,
      })
      .from(theoryProgress)
      .where(eq(theoryProgress.email, user.email)),
  ]);

  return Response.json({
    favoriteIds: favoriteRows.map(({ id }) => id),
    answeredIds: progressRows.map(({ id }) => id),
    wrongIds: progressRows.filter(({ correct }) => !correct).map(({ id }) => id),
    progress: progressRows.map(({ id, answerJson, correct }) => ({
      questionId: id,
      answer: JSON.parse(answerJson) as string[],
      correct,
    })),
  });
}
