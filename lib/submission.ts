import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb, withDbDeadline } from "@/db";
import { apiSubmissions } from "@/db/schema";
import assets from "@/data/content-assets.json";

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export const theoryContentId = createHash("sha256").update(assets.theory).digest("hex");

export class SubmissionError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}

export async function saveSubmission<T>(
  email: string, operation: string,
  payload: { submissionId?: unknown; contentId?: unknown },
  run: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const id = payload.submissionId;
  if (id !== undefined && (typeof id !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(id))) throw new SubmissionError("提交编号无效", 400);
  if (id !== undefined && typeof payload.contentId !== "string") throw new SubmissionError("缺少题库标识", 400);
  const hash = createHash("sha256").update(canonical(payload)).digest("hex");
  return withDbDeadline(operation, (db) => db.transaction(async (tx) => {
    // Bound lock contention to this transaction, never close the shared pool.
    await tx.execute(sql`set local statement_timeout = '5s'`);
    await tx.execute(sql`set local lock_timeout = '3s'`);
    if (typeof id === "string") {
      const inserted = await tx.insert(apiSubmissions).values({ email, operation, submissionId: id, payloadHash: hash, responseJson: "null" }).onConflictDoNothing().returning({ submissionId: apiSubmissions.submissionId });
      if (!inserted.length) {
        const [prior] = await tx.select().from(apiSubmissions).where(and(eq(apiSubmissions.email, email), eq(apiSubmissions.operation, operation), eq(apiSubmissions.submissionId, id))).limit(1);
        if (!prior || prior.payloadHash !== hash) throw new SubmissionError("同一提交编号不能用于不同内容");
        return JSON.parse(prior.responseJson) as T;
      }
    }
    if (payload.contentId !== undefined && payload.contentId !== theoryContentId) throw new SubmissionError("题库已更新，请保留本机记录并更新题库后继续练习");
    const result = await run(tx);
    if (typeof id === "string") await tx.update(apiSubmissions).set({ responseJson: JSON.stringify(result) }).where(and(eq(apiSubmissions.email, email), eq(apiSubmissions.operation, operation), eq(apiSubmissions.submissionId, id)));
    return result;
  }));
}
