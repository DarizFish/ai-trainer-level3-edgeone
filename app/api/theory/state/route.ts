import { and, eq } from "drizzle-orm";
import { withDbDeadline } from "@/db";
import { favorites, theoryProgress } from "@/db/schema";
import { withDatabaseErrors } from "@/lib/api-db";
import { requireApiUser, unauthorized } from "@/lib/server-user";

export const dynamic = "force-dynamic";

export const GET = withDatabaseErrors("theory.state", async () => {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  // 连接池是 max: 1，这两条查询无论如何都会排队执行，所以共用一个 deadline，
  // 而不是各自计时——分开计时会让两条各拿满 8 秒，合计逼近 EdgeOne 的 30 秒上限。
  const [favoriteRows, progressRows] = await withDbDeadline("theory.state.load", (db) => Promise.all([
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
  ]));

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
});
