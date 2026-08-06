import { content, practicalByCode } from "@/lib/content";
import { requireApiUser, unauthorized } from "@/lib/server-user";
import { withDbDeadline } from "@/db";
import { practicalAttempts } from "@/db/schema";
import { withDatabaseErrors } from "@/lib/api-db";
import { validatePracticalExamTasks, type PracticalExamResult } from "@/lib/practical-exam-storage";
import { scorePractical } from "@/lib/scoring";
import { practicalMockEnabled } from "@/lib/features";

type AttemptInput = {
  taskCode?: unknown;
  rubric?: unknown;
  notes?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function scoreAttempt(input: AttemptInput) {
  const task = typeof input.taskCode === "string" ? practicalByCode.get(input.taskCode) : null;
  if (!task || !isRecord(input.rubric)) return null;
  const scored = scorePractical(task, input.rubric);
  const result: PracticalExamResult = {
    score: scored.score,
    maxScore: task.maxScore,
    passed: scored.score >= task.maxScore * 0.6,
  };
  return {
    task,
    scored,
    notes: typeof input.notes === "string" ? input.notes.slice(0, 20_000) : "",
    result,
  };
}

export const POST = withDatabaseErrors("practical.attempt", async (request: Request) => {
  if (!practicalMockEnabled) {
    return Response.json({ error: "实操组卷暂未开放" }, { status: 404 });
  }

  const user = await requireApiUser();
  if (!user) return unauthorized();

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return Response.json({ error: "请求数据无效" }, { status: 400 });
  }
  if (!isRecord(parsed)) return Response.json({ error: "请求数据无效" }, { status: 400 });
  const payload = parsed as AttemptInput & { attempts?: unknown };

  if (Array.isArray(payload.attempts)) {
    const inputs = payload.attempts as AttemptInput[];
    const tasks = validatePracticalExamTasks(inputs.map((attempt) => attempt?.taskCode), content.practical);
    if (!tasks) return Response.json({ error: "实操模拟卷必须严格包含六个官方模块且总分为 100 分" }, { status: 400 });

    const attempts = inputs.map(scoreAttempt);
    if (attempts.some((attempt) => !attempt)) return Response.json({ error: "实操题或评分数据无效" }, { status: 400 });
    const verifiedAttempts = attempts as NonNullable<ReturnType<typeof scoreAttempt>>[];
    // deadline 包住整个事务：超时会退掉那条连接，未提交的事务随之回滚，不会留下
    // 只写进去一半的成绩。
    await withDbDeadline("practical.attempt.batch", (db) => db.transaction(async (transaction) => {
      for (const { task, scored, notes } of verifiedAttempts) {
        await transaction.insert(practicalAttempts).values({
          email: user.email,
          taskCode: task.code,
          score: scored.score,
          maxScore: task.maxScore,
          rubricJson: JSON.stringify(scored.rubric),
          notes,
          contentVersion: content.version,
        });
      }
    }));
    return Response.json({
      results: Object.fromEntries(verifiedAttempts.map(({ task, result }) => [task.code, result])),
    });
  }

  const attempt = scoreAttempt(payload);
  if (!attempt) return Response.json({ error: "实操题或评分数据无效" }, { status: 400 });
  await withDbDeadline("practical.attempt.insert", (db) => db.insert(practicalAttempts).values({
    email: user.email,
    taskCode: attempt.task.code,
    score: attempt.scored.score,
    maxScore: attempt.task.maxScore,
    rubricJson: JSON.stringify(attempt.scored.rubric),
    notes: attempt.notes,
    contentVersion: content.version,
  }));
  return Response.json(attempt.result);
}, "成绩暂时无法保存，请稍后重试");
