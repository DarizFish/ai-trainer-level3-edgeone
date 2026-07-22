import { content, theoryById } from "@/lib/content";
import { scoreTheory } from "@/lib/scoring";
import { requireApiUser, unauthorized } from "@/lib/server-user";
import { getDb } from "@/db";
import { theoryAttempts } from "@/db/schema";
import { examBlueprint } from "@/lib/exam-blueprint";

export async function POST(request: Request) {
  const user = await requireApiUser(); if (!user) return unauthorized();
  const payload = await request.json() as { mode?: string; questionIds?: string[]; answers?: Record<string, string[]> };
  if (!Array.isArray(payload.questionIds) || payload.questionIds.length !== examBlueprint.theory.totalQuestions || new Set(payload.questionIds).size !== examBlueprint.theory.totalQuestions || !payload.answers) return Response.json({ error: "试卷结构无效" }, { status: 400 });
  const questions = payload.questionIds.map((id) => theoryById.get(id));
  if (questions.some((question) => !question)) return Response.json({ error: "试卷包含未知题目" }, { status: 400 });
  const typed = questions as NonNullable<(typeof questions)[number]>[];
  const distribution = { judge: typed.filter((q) => q.type === "judge").length, single: typed.filter((q) => q.type === "single").length, multi: typed.filter((q) => q.type === "multi").length };
  if (distribution.judge !== examBlueprint.theory.types.judge.count || distribution.single !== examBlueprint.theory.types.single.count || distribution.multi !== examBlueprint.theory.types.multi.count) return Response.json({ error: "试卷题型配比无效" }, { status: 400 });
  const result = scoreTheory(typed, payload.answers); const db = getDb();
  await db.insert(theoryAttempts).values({ email: user.email, mode: payload.mode === "official" ? "official" : "random", score: result.score, maxScore: result.maxScore, passed: result.passed, answersJson: JSON.stringify(payload.answers), contentVersion: content.version });
  return Response.json(result);
}
