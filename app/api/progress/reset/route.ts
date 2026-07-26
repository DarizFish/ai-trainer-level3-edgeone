import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { codeDrafts, practicalAttempts, theoryProgress } from "@/db/schema";
import { content, type TheoryType } from "@/lib/content";
import { requireApiUser, unauthorized } from "@/lib/server-user";

type ResetRequest = {
  scope?: unknown;
  type?: unknown;
  group?: unknown;
};

const theoryTypes = new Set<TheoryType>(["judge", "single", "multi"]);

export async function DELETE(request: Request) {
  const user = await requireApiUser();
  if (!user) return unauthorized();

  let payload: ResetRequest;
  try {
    payload = await request.json() as ResetRequest;
  } catch {
    return Response.json({ error: "请求数据无效" }, { status: 400 });
  }

  const db = getDb();
  if (payload.scope === "theory" && typeof payload.type === "string" && theoryTypes.has(payload.type as TheoryType)) {
    const type = payload.type as TheoryType;
    const questionIds = content.theory.filter((question) => question.type === type).map((question) => question.id);
    await db.delete(theoryProgress).where(and(
      eq(theoryProgress.email, user.email),
      inArray(theoryProgress.questionId, questionIds),
    ));
    return Response.json({ reset: questionIds.length, scope: "theory", type });
  }

  if (payload.scope === "practical" && typeof payload.group === "string") {
    const taskCodes = content.practical.filter((task) => task.group === payload.group).map((task) => task.code);
    if (!taskCodes.length) return Response.json({ error: "实操章节无效" }, { status: 400 });
    await db.transaction(async (transaction) => {
      await transaction.delete(practicalAttempts).where(and(
        eq(practicalAttempts.email, user.email),
        inArray(practicalAttempts.taskCode, taskCodes),
      ));
      await transaction.delete(codeDrafts).where(and(
        eq(codeDrafts.email, user.email),
        inArray(codeDrafts.taskCode, taskCodes),
      ));
    });
    return Response.json({ reset: taskCodes.length, scope: "practical", group: payload.group, taskCodes });
  }

  return Response.json({ error: "重置范围无效" }, { status: 400 });
}
