import { content, theoryById } from "@/lib/content";
import { isCorrect } from "@/lib/scoring";
import { requireApiUser, unauthorized } from "@/lib/server-user";
import { theoryProgress } from "@/db/schema";
import { databaseUnavailable } from "@/lib/api-db";
import { recordServerEvent } from "@/lib/analytics-server";
import { sql } from "drizzle-orm";
import { saveSubmission, SubmissionError } from "@/lib/submission";

const SYNC_UNAVAILABLE = "学习记录暂时无法同步，请稍后重试";

export async function POST(request: Request) {
  let user;
  try {
    user = await requireApiUser();
  } catch (cause) {
    return databaseUnavailable("theory.answer.auth", cause, SYNC_UNAVAILABLE);
  }
  if (!user) return unauthorized();
  const payload = await request.json().catch(() => null) as {
    submissionId?: unknown;
    contentId?: unknown;
    questionId?: string;
    answer?: string[];
    attempts?: Array<{ questionId?: string; answer?: string[]; attempts?: number }>;
  } | null;
  if (!payload || typeof payload !== "object") return Response.json({ error: "提交格式无效" }, { status: 400 });
  const submitted = Array.isArray(payload.attempts)
    ? payload.attempts
    : [{ questionId: payload.questionId, answer: payload.answer, attempts: 1 }];
  if (!submitted.length || submitted.length > 100) {
    return Response.json({ error: "答题记录数量无效" }, { status: 400 });
  }

  const normalized = new Map<string, { answer: string[]; attempts: number; correct: boolean }>();
  for (const item of submitted) {
    if (!item || typeof item !== "object") return Response.json({ error: "答题记录格式无效" }, { status: 400 });
    const question = item.questionId ? theoryById.get(item.questionId) : null;
    if (!question || !Array.isArray(item.answer)) {
      return Response.json({ error: "题目或答案无效" }, { status: 400 });
    }
    const answer = item.answer.filter((value): value is string => typeof value === "string");
    const valid = question.type === "judge"
      ? ["√", "×"]
      : question.options.map((_, index) => String.fromCharCode(65 + index));
    const attemptCount = Number.isInteger(item.attempts)
      ? Math.min(Math.max(item.attempts ?? 1, 1), 50)
      : 1;
    if (!answer.length || answer.length !== item.answer.length || new Set(answer).size !== answer.length || (question.type !== "multi" && answer.length !== 1) || answer.some((value) => !valid.includes(value))) {
      return Response.json({ error: "答案选项无效" }, { status: 400 });
    }
    const existing = normalized.get(question.id);
    normalized.set(question.id, {
      answer,
      attempts: (existing?.attempts ?? 0) + attemptCount,
      correct: isCorrect(question, answer),
    });
  }

  const rows = [...normalized].map(([questionId, value]) => ({
    email: user.email,
    questionId,
    answerJson: JSON.stringify(value.answer),
    correct: value.correct,
    attempts: value.attempts,
    contentVersion: content.version,
  }));
  const question = payload.questionId ? theoryById.get(payload.questionId) : null;
  const responseBody = !Array.isArray(payload.attempts) && question
    ? { correct: normalized.get(question.id)!.correct, answer: question.answer, explanation: question.explanation, answerSource: question.answerSource }
    : { saved: rows.length };
  let saved: object;
  try {
    saved = await saveSubmission(user.email, "theory.answer.upsert", payload, async (db) => {
      await db
      .insert(theoryProgress)
      .values(rows)
      .onConflictDoUpdate({
        target: [theoryProgress.email, theoryProgress.questionId],
        set: {
          answerJson: sql`excluded.answer_json`,
          correct: sql`excluded.correct`,
          attempts: sql`${theoryProgress.attempts} + excluded.attempts`,
          contentVersion: sql`excluded.content_version`,
          updatedAt: new Date().toISOString(),
        },
      });
      return responseBody;
    });
  } catch (cause) {
    if (cause instanceof SubmissionError) return Response.json({ error: cause.message }, { status: cause.status });
    return databaseUnavailable("theory.answer.upsert", cause, SYNC_UNAVAILABLE);
  }

  recordServerEvent({ event_name: "theory.answers_saved", question_count: rows.length, content_version: content.version });

  return Response.json(saved);
}
