import { and, eq } from "drizzle-orm";
import { withDbDeadline } from "@/db";
import { codeDrafts } from "@/db/schema";
import { withDatabaseErrors } from "@/lib/api-db";
import { clientAddress } from "@/lib/auth-throttle";
import { content, practicalByCode } from "@/lib/content";
import { requireApiUser, unauthorized } from "@/lib/server-user";

// IP 只用于服务端后续识别异常请求，不随草稿内容返回给浏览器。
const draftResponseColumns = {
  email: codeDrafts.email,
  taskCode: codeDrafts.taskCode,
  cellsJson: codeDrafts.cellsJson,
  revision: codeDrafts.revision,
  contentVersion: codeDrafts.contentVersion,
  updatedAt: codeDrafts.updatedAt,
};

// 草稿最大 4 MB，跨洋写入比其它语句慢一个量级，给它单独放宽到 20 秒——仍然留够
// 余量在 EdgeOne 的 30 秒上限之前失败，好让客户端拿到可重试的 503。
const DRAFT_WRITE_TIMEOUT_MS = 20_000;

export const GET = withDatabaseErrors("drafts.read", async (_: Request, { params }: { params: Promise<{ code: string }> }) => {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const { code } = await params;
  const [draft] = await withDbDeadline("drafts.read", (db) => db.select(draftResponseColumns).from(codeDrafts).where(and(eq(codeDrafts.email, user.email), eq(codeDrafts.taskCode, code))).limit(1));
  return Response.json({ draft: draft ?? null });
}, "云端草稿暂时无法读取，请稍后重试");

export const PUT = withDatabaseErrors("drafts.write", async (request: Request, { params }: { params: Promise<{ code: string }> }) => {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const { code } = await params;
  const task = practicalByCode.get(code);
  if (!task) return Response.json({ error: "实验不存在" }, { status: 404 });

  const payload = await request.json() as {
    notebook?: unknown; cells?: unknown; answerSheet?: unknown; revision?: number;
  };
  if (typeof payload.revision !== "number") {
    return Response.json({ error: "草稿格式无效" }, { status: 400 });
  }

  // 文档题（1.2/3.1/4.1/4.2）此前只写 localStorage，换设备即丢，而界面宣称草稿会保存。
  // 它们没有 Notebook，与 Notebook 草稿在 (email, taskCode) 上互斥，可以共用这张表。
  let draft: unknown;
  if (task.hasNotebook) {
    draft = payload.notebook ?? payload.cells;
    const isNotebook = Boolean(draft && typeof draft === "object" && !Array.isArray(draft) && Array.isArray((draft as { cells?: unknown }).cells));
    if (!isNotebook && !Array.isArray(draft)) {
      return Response.json({ error: "Notebook 草稿格式无效" }, { status: 400 });
    }
  } else {
    const sheet = payload.answerSheet as { answers?: unknown; scores?: unknown; checks?: unknown } | undefined;
    const isRecordOf = (value: unknown, check: (item: unknown) => boolean) =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value)
      && Object.values(value as Record<string, unknown>).every(check);
    // 1.2/3.1 的答题卷记数值自评分，4.1/4.2 的模板题记每空是否达标，两种都放行。
    const valid = Boolean(sheet)
      && isRecordOf(sheet?.answers, (item) => typeof item === "string" && item.length <= 10_000)
      && (sheet?.scores === undefined || isRecordOf(sheet.scores, (item) => typeof item === "number" && Number.isInteger(item) && item >= 0 && item <= 100))
      && (sheet?.checks === undefined || isRecordOf(sheet.checks, (item) => typeof item === "boolean"));
    if (!valid) return Response.json({ error: "答题卷草稿格式无效" }, { status: 400 });
    draft = sheet;
  }

  const serialized = JSON.stringify(draft);
  if (serialized.length > 4_000_000) {
    return Response.json({ error: "Notebook 草稿超过 4 MB，请清理超大输出后重试" }, { status: 413 });
  }

  const [current] = await withDbDeadline("drafts.write.revision", (db) => db.select({ cellsJson: codeDrafts.cellsJson, revision: codeDrafts.revision }).from(codeDrafts).where(and(eq(codeDrafts.email, user.email), eq(codeDrafts.taskCode, code))).limit(1));
  if (current && current.revision !== payload.revision) {
    return Response.json({ conflict: true, local: draft, cloud: JSON.parse(current.cellsJson), revision: current.revision }, { status: 409 });
  }

  const revision = (current?.revision ?? 0) + 1;
  const ip = clientAddress(request);
  await withDbDeadline("drafts.write.upsert", (db) => db.insert(codeDrafts).values({
    email: user.email,
    taskCode: code,
    cellsJson: serialized,
    revision,
    contentVersion: content.version,
    ip,
  }).onConflictDoUpdate({
    target: [codeDrafts.email, codeDrafts.taskCode],
    set: { cellsJson: serialized, revision, contentVersion: content.version, ip, updatedAt: new Date().toISOString() },
  }), DRAFT_WRITE_TIMEOUT_MS);
  return Response.json({ revision });
}, "云端草稿暂时无法保存，请稍后重试");
