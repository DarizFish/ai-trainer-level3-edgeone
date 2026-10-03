import { content, theoryById } from "@/lib/content";
import { scoreTheory } from "@/lib/scoring";
import { requireApiUser, unauthorized } from "@/lib/server-user";
import { withDbDeadline } from "@/db";
import { theoryAttempts } from "@/db/schema";
import { withDatabaseErrors } from "@/lib/api-db";
import { examBlueprint } from "@/lib/exam-blueprint";
import { recordServerEvent } from "@/lib/analytics-server";
import { saveSubmission, SubmissionError } from "@/lib/submission";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const GET = withDatabaseErrors("theory.attempt.history", async () => {
  const user = await requireApiUser(); if (!user) return unauthorized();
  const attempts = await withDbDeadline("theory.attempt.history", (db) => db.select({
    id: theoryAttempts.id, mode: theoryAttempts.mode, score: theoryAttempts.score,
    maxScore: theoryAttempts.maxScore, passed: theoryAttempts.passed,
    createdAt: theoryAttempts.createdAt, contentVersion: theoryAttempts.contentVersion,
  }).from(theoryAttempts).where(eq(theoryAttempts.email, user.email)).orderBy(desc(theoryAttempts.createdAt)).limit(100));
  return Response.json({ attempts }, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = withDatabaseErrors("theory.attempt", async (request: Request) => {
  const user = await requireApiUser(); if (!user) return unauthorized();
  const payload = await request.json().catch(() => null) as { mode?: string; questionIds?: string[]; answers?: Record<string, string[]>; submissionId?: unknown; contentId?: unknown } | null;
  if (!payload || typeof payload !== "object") return Response.json({ error: "提交格式无效" }, { status: 400 });
  if (!Array.isArray(payload.questionIds) || payload.questionIds.length !== examBlueprint.theory.totalQuestions || new Set(payload.questionIds).size !== examBlueprint.theory.totalQuestions || !payload.answers) return Response.json({ error: "试卷结构无效" }, { status: 400 });
  const questions = payload.questionIds.map((id) => theoryById.get(id));
  if (questions.some((question) => !question)) return Response.json({ error: "试卷包含未知题目" }, { status: 400 });
  const typed = questions as NonNullable<(typeof questions)[number]>[];
  if (typeof payload.answers !== "object" || Array.isArray(payload.answers)) return Response.json({ error: "答案格式无效" }, { status: 400 });
  for (const [id, values] of Object.entries(payload.answers)) {
    const question = typed.find((item) => item.id === id);
    const valid = question?.type === "judge" ? ["√", "×"] : question?.options.map((_, index) => String.fromCharCode(65 + index));
    if (!question || !Array.isArray(values) || values.some((value) => !valid?.includes(value)) || new Set(values).size !== values.length || (question.type !== "multi" && values.length > 1)) return Response.json({ error: "答案选项无效" }, { status: 400 });
  }
  const distribution = { judge: typed.filter((q) => q.type === "judge").length, single: typed.filter((q) => q.type === "single").length, multi: typed.filter((q) => q.type === "multi").length };
  if (distribution.judge !== examBlueprint.theory.types.judge.count || distribution.single !== examBlueprint.theory.types.single.count || distribution.multi !== examBlueprint.theory.types.multi.count) return Response.json({ error: "试卷题型配比无效" }, { status: 400 });
  const result = scoreTheory(typed, payload.answers);
  const mode: "official" | "random" = payload.mode === "official" ? "official" : "random";
  const row = { email: user.email, mode, score: result.score, maxScore: result.maxScore, passed: result.passed, answersJson: JSON.stringify(payload.answers), contentVersion: content.version };
  let saved: typeof result;
  try {
    saved = await saveSubmission(user.email, "theory.attempt.insert", payload, async (db) => {
      await db.insert(theoryAttempts).values(row);
      return result;
    });
  } catch (cause) {
    if (cause instanceof SubmissionError) return Response.json({ error: cause.message }, { status: cause.status });
    throw cause;
  }
  recordServerEvent({ event_name: "theory.exam_submitted", mode: row.mode, content_version: content.version });
  return Response.json(saved);
}, "成绩暂时无法保存，请稍后重试");
