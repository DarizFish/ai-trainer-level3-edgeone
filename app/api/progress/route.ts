import { and, count, desc, eq, max } from "drizzle-orm";
import { getDb } from "@/db";
import { codeDrafts, favorites, practicalAttempts, theoryAttempts, theoryProgress } from "@/db/schema";
import { practicalByCode, theoryById } from "@/lib/content";
import { examBlueprint, practicalModuleForGroup } from "@/lib/exam-blueprint";
import { requireApiUser, unauthorized } from "@/lib/server-user";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const db = getDb();
  const [[answered], [wrong], [saved], [practical], [mocks], [best], [drafts], wrongRows, favoriteRows, recentMockRows, recentPracticalRows, practicalRows] = await Promise.all([
    db.select({ value: count() }).from(theoryProgress).where(eq(theoryProgress.email, user.email)),
    db.select({ value: count() }).from(theoryProgress).where(and(eq(theoryProgress.email, user.email), eq(theoryProgress.correct, false))),
    db.select({ value: count() }).from(favorites).where(and(eq(favorites.email, user.email), eq(favorites.active, true))),
    db.select({ value: count() }).from(practicalAttempts).where(eq(practicalAttempts.email, user.email)),
    db.select({ value: count() }).from(theoryAttempts).where(eq(theoryAttempts.email, user.email)),
    db.select({ value: max(theoryAttempts.score) }).from(theoryAttempts).where(eq(theoryAttempts.email, user.email)),
    db.select({ value: count() }).from(codeDrafts).where(eq(codeDrafts.email, user.email)),
    db.select({ questionId: theoryProgress.questionId, answerJson: theoryProgress.answerJson, attempts: theoryProgress.attempts, updatedAt: theoryProgress.updatedAt })
      .from(theoryProgress).where(and(eq(theoryProgress.email, user.email), eq(theoryProgress.correct, false))).orderBy(desc(theoryProgress.updatedAt)).limit(50),
    db.select({ itemType: favorites.itemType, itemId: favorites.itemId, updatedAt: favorites.updatedAt })
      .from(favorites).where(and(eq(favorites.email, user.email), eq(favorites.active, true))).orderBy(desc(favorites.updatedAt)).limit(50),
    db.select({ mode: theoryAttempts.mode, score: theoryAttempts.score, maxScore: theoryAttempts.maxScore, passed: theoryAttempts.passed, createdAt: theoryAttempts.createdAt })
      .from(theoryAttempts).where(eq(theoryAttempts.email, user.email)).orderBy(desc(theoryAttempts.createdAt)).limit(8),
    db.select({ taskCode: practicalAttempts.taskCode, score: practicalAttempts.score, maxScore: practicalAttempts.maxScore, createdAt: practicalAttempts.createdAt })
      .from(practicalAttempts).where(eq(practicalAttempts.email, user.email)).orderBy(desc(practicalAttempts.createdAt)).limit(8),
    db.select({ taskCode: practicalAttempts.taskCode, score: practicalAttempts.score, maxScore: practicalAttempts.maxScore })
      .from(practicalAttempts).where(eq(practicalAttempts.email, user.email)),
  ]);

  const practicalAbility = examBlueprint.practical.modules.map((module) => {
    const rows = practicalRows.filter((row) => {
      const task = practicalByCode.get(row.taskCode);
      return task && practicalModuleForGroup(task.group)?.key === module.key;
    });
    const bestScore = rows.reduce((bestValue, row) => Math.max(bestValue, row.maxScore ? (row.score / row.maxScore) * module.maxScore : 0), 0);
    return { key: module.key, label: module.label, maxScore: module.maxScore, bestScore: Math.round(bestScore * 10) / 10, attempts: rows.length };
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

  const favoriteItems = favoriteRows.flatMap<{ itemType: "theory" | "practical"; itemId: string; title: string; meta: string; href: string; updatedAt: string }>((row) => {
    if (row.itemType === "theory") {
      const question = theoryById.get(row.itemId);
      return question ? [{ itemType: "theory" as const, itemId: question.id, title: question.stem, meta: `${question.typeLabel} · ${question.category}`, href: `/theory?question=${encodeURIComponent(question.id)}`, updatedAt: row.updatedAt }] : [];
    }
    if (row.itemType === "practical") {
      const task = practicalByCode.get(row.itemId);
      const href = task?.hasNotebook ? `/practical/${encodeURIComponent(task.code)}/lab` : `/practical/${encodeURIComponent(task?.code ?? row.itemId)}`;
      return task ? [{ itemType: "practical" as const, itemId: task.code, title: task.title, meta: `${task.code} · ${task.category}`, href, updatedAt: row.updatedAt }] : [];
    }
    return [];
  });

  return Response.json({
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
      return { ...row, title: task?.title ?? row.taskCode, href: task?.hasNotebook ? `/practical/${encodeURIComponent(row.taskCode)}/lab` : `/practical/${encodeURIComponent(row.taskCode)}` };
    }),
  });
}
