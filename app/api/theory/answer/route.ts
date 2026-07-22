import { content, theoryById } from "@/lib/content";
import { isCorrect } from "@/lib/scoring";
import { requireApiUser, unauthorized } from "@/lib/server-user";
import { getDb } from "@/db";
import { theoryProgress } from "@/db/schema";
import { sql } from "drizzle-orm";

export async function POST(request: Request) {
  const user = await requireApiUser(); if (!user) return unauthorized();
  const payload = await request.json() as { questionId?: string; answer?: string[] };
  const question = payload.questionId ? theoryById.get(payload.questionId) : null;
  if (!question || !Array.isArray(payload.answer)) return Response.json({ error: "题目或答案无效" }, { status: 400 });
  const answer = payload.answer.filter((item): item is string => typeof item === "string");
  const valid = question.type === "judge" ? ["√", "×"] : question.options.map((_, index) => String.fromCharCode(65 + index));
  if (!answer.length || answer.some((item) => !valid.includes(item))) return Response.json({ error: "答案选项无效" }, { status: 400 });
  const correct = isCorrect(question, answer); const db = getDb();
  await db.insert(theoryProgress).values({ email: user.email, questionId: question.id, answerJson: JSON.stringify(answer), correct, contentVersion: content.version }).onConflictDoUpdate({ target: [theoryProgress.email, theoryProgress.questionId], set: { answerJson: JSON.stringify(answer), correct, attempts: sql`${theoryProgress.attempts} + 1`, contentVersion: content.version, updatedAt: new Date().toISOString() } });
  return Response.json({ correct, answer: question.answer, explanation: question.explanation, answerSource: question.answerSource });
}
