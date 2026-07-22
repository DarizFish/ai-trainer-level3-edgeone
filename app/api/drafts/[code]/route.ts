import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { codeDrafts } from "@/db/schema";
import { content, practicalByCode } from "@/lib/content";
import { requireApiUser, unauthorized } from "@/lib/server-user";

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const { code } = await params;
  const [draft] = await getDb().select().from(codeDrafts).where(and(eq(codeDrafts.email, user.email), eq(codeDrafts.taskCode, code))).limit(1);
  return Response.json({ draft: draft ?? null });
}

export async function PUT(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const { code } = await params;
  const task = practicalByCode.get(code);
  if (!task?.hasNotebook) return Response.json({ error: "实验不存在" }, { status: 404 });

  const payload = await request.json() as { notebook?: unknown; cells?: unknown; revision?: number };
  const draft = payload.notebook ?? payload.cells;
  const isNotebook = Boolean(draft && typeof draft === "object" && !Array.isArray(draft) && Array.isArray((draft as { cells?: unknown }).cells));
  const isLegacyDraft = Array.isArray(draft);
  if ((!isNotebook && !isLegacyDraft) || typeof payload.revision !== "number") {
    return Response.json({ error: "Notebook 草稿格式无效" }, { status: 400 });
  }

  const serialized = JSON.stringify(draft);
  if (serialized.length > 4_000_000) {
    return Response.json({ error: "Notebook 草稿超过 4 MB，请清理超大输出后重试" }, { status: 413 });
  }

  const db = getDb();
  const [current] = await db.select().from(codeDrafts).where(and(eq(codeDrafts.email, user.email), eq(codeDrafts.taskCode, code))).limit(1);
  if (current && current.revision !== payload.revision) {
    return Response.json({ conflict: true, local: draft, cloud: JSON.parse(current.cellsJson), revision: current.revision }, { status: 409 });
  }

  const revision = (current?.revision ?? 0) + 1;
  await db.insert(codeDrafts).values({
    email: user.email,
    taskCode: code,
    cellsJson: serialized,
    revision,
    contentVersion: content.version,
  }).onConflictDoUpdate({
    target: [codeDrafts.email, codeDrafts.taskCode],
    set: { cellsJson: serialized, revision, contentVersion: content.version, updatedAt: new Date().toISOString() },
  });
  return Response.json({ revision });
}
