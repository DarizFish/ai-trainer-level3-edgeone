import { and, count, desc, eq, max } from "drizzle-orm";
import { getDb } from "@/db";
import { codeDrafts, favorites, practicalAttempts, theoryAttempts, theoryProgress } from "@/db/schema";
import { practicalByCode, theoryById } from "@/lib/content";
import { examBlueprint, practicalModuleForGroup } from "@/lib/exam-blueprint";

export type ProgressData = Awaited<ReturnType<typeof getProgressData>>;

export async function getProgressData(email: string) {
  const db = getDb();
  const [
    [answered],
    [wrong],
    [saved],
    [practical],
    [mocks],
    [best],
    [drafts],
    wrongRows,
    favoriteRows,
    recentMockRows,
    recentPracticalRows,
    practicalRows,
  ] = await Promise.all([
    db.select({ value: count() }).from(theoryProgress).where(eq(theoryProgress.email, email)),
    db.select({ value: count() }).from(theoryProgress).where(and(eq(theoryProgress.email, email), eq(theoryProgress.correct, false))),
    db.select({ value: count() }).from(favorites).where(and(eq(favorites.email, email), eq(favorites.active, true))),
    db.select({ value: count() }).from(practicalAttempts).where(eq(practicalAttempts.email, email)),
    db.select({ value: count() }).from(theoryAttempts).where(eq(theoryAttempts.email, email)),
    db.select({ value: max(theoryAttempts.score) }).from(theoryAttempts).where(eq(theoryAttempts.email, email)),
    db.select({ value: count() }).from(codeDrafts).where(eq(codeDrafts.email, email)),
    db
      .select({
        questionId: theoryProgress.questionId,
        answerJson: theoryProgress.answerJson,
        attempts: theoryProgress.attempts,
        updatedAt: theoryProgress.updatedAt,
      })
      .from(theoryProgress)
      .where(and(eq(theoryProgress.email, email), eq(theoryProgress.correct, false)))
      .orderBy(desc(theoryProgress.updatedAt))
      .limit(50),
    db
      .select({
        itemType: favorites.itemType,
        itemId: favorites.itemId,
        updatedAt: favorites.updatedAt,
      })
      .from(favorites)
      .where(and(eq(favorites.email, email), eq(favorites.active, true)))
      .orderBy(desc(favorites.updatedAt))
      .limit(50),
    db
      .select({
        mode: theoryAttempts.mode,
        score: theoryAttempts.score,
        maxScore: theoryAttempts.maxScore,
        passed: theoryAttempts.passed,
        createdAt: theoryAttempts.createdAt,
      })
      .from(theoryAttempts)
      .where(eq(theoryAttempts.email, email))
      .orderBy(desc(theoryAttempts.createdAt))
      .limit(8),
    db
      .select({
        taskCode: practicalAttempts.taskCode,
        score: practicalAttempts.score,
        maxScore: practicalAttempts.maxScore,
        createdAt: practicalAttempts.createdAt,
      })
      .from(practicalAttempts)
      .where(eq(practicalAttempts.email, email))
      .orderBy(desc(practicalAttempts.createdAt))
      .limit(8),
    db
      .select({
        taskCode: practicalAttempts.taskCode,
        score: practicalAttempts.score,
        maxScore: practicalAttempts.maxScore,
      })
      .from(practicalAttempts)
      .where(eq(practicalAttempts.email, email)),
  ]);

  const practicalAbility = examBlueprint.practical.modules.map((module) => {
    const rows = practicalRows.filter((row) => {
      const task = practicalByCode.get(row.taskCode);
      return task && practicalModuleForGroup(task.group)?.key === module.key;
    });
    const bestScore = rows.reduce(
      (bestValue, row) => Math.max(
        bestValue,
        row.maxScore ? (row.score / row.maxScore) * module.maxScore : 0,
      ),
      0,
    );
    return {
      key: module.key,
      label: module.label,
      maxScore: module.maxScore,
      bestScore: Math.round(bestScore * 10) / 10,
      attempts: rows.length,
    };
  });

  const wrongItems = wrongRows.flatMap((row) => {
    const question = theoryById.get(row.questionId);
    if (!question) return [];
    return [{
      id: question.id,
      index: question.index,
      typeLabel: question.typeLabel,
      category: question.category,
      stem: question.stem,
      selectedAnswer: JSON.parse(row.answerJson) as string[],
      correctAnswer: question.answer,
      attempts: row.attempts,
      updatedAt: row.updatedAt,
      href: `/theory?question=${encodeURIComponent(question.id)}`,
    }];
  });

  const favoriteItems = favoriteRows.flatMap<{
    itemType: "theory" | "practical";
    itemId: string;
    title: string;
    meta: string;
    href: string;
    updatedAt: string;
  }>((row) => {
    if (row.itemType === "theory") {
      const question = theoryById.get(row.itemId);
      return question ? [{
        itemType: "theory" as const,
        itemId: question.id,
        title: question.stem,
        meta: `${question.typeLabel} · ${question.category}`,
        href: `/theory?question=${encodeURIComponent(question.id)}`,
        updatedAt: row.updatedAt,
      }] : [];
    }
    if (row.itemType === "practical") {
      const task = practicalByCode.get(row.itemId);
      const href = task?.hasNotebook
        ? `/practical/${encodeURIComponent(task.code)}/lab`
        : `/practical/${encodeURIComponent(task?.code ?? row.itemId)}`;
      return task ? [{
        itemType: "practical" as const,
        itemId: task.code,
        title: task.title,
        meta: `${task.code} · ${task.category}`,
        href,
        updatedAt: row.updatedAt,
      }] : [];
    }
    return [];
  });

  return {
    answered: answered.value,
    wrong: wrong.value,
    favorites: saved.value,
    practicalAttempts: practical.value,
    mockAttempts: mocks.value,
    bestTheoryScore: best.value ?? 0,
    practicalAbility,
    estimatedPracticalScore: practicalAbility.reduce((sum, module) => sum + module.bestScore, 0),
    drafts: drafts.value,
    wrongItems,
    favoriteItems,
    recentMocks: recentMockRows,
    recentPractical: recentPracticalRows.map((row) => {
      const task = practicalByCode.get(row.taskCode);
      return {
        ...row,
        title: task?.title ?? row.taskCode,
        href: task?.hasNotebook
          ? `/practical/${encodeURIComponent(row.taskCode)}/lab`
          : `/practical/${encodeURIComponent(row.taskCode)}`,
      };
    }),
  };
}
