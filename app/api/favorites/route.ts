import { and, eq } from "drizzle-orm";
import { withDbDeadline } from "@/db";
import { favorites } from "@/db/schema";
import { withDatabaseErrors } from "@/lib/api-db";
import { theoryById, practicalByCode } from "@/lib/content";
import { requireApiUser, unauthorized } from "@/lib/server-user";

export const GET = withDatabaseErrors("favorites.read", async () => {
  const user = await requireApiUser(); if (!user) return unauthorized();
  const rows = await withDbDeadline("favorites.read", (db) => db.select().from(favorites).where(and(eq(favorites.email, user.email), eq(favorites.active, true))));
  return Response.json({ favorites: rows });
});

export const POST = withDatabaseErrors("favorites.write", async (request: Request) => {
  const user = await requireApiUser(); if (!user) return unauthorized();
  const payload = await request.json() as { itemType?: string; itemId?: string; active?: boolean };
  const valid = payload.itemType === "theory" ? Boolean(payload.itemId && theoryById.has(payload.itemId)) : payload.itemType === "practical" ? Boolean(payload.itemId && practicalByCode.has(payload.itemId)) : false;
  if (!valid || typeof payload.active !== "boolean") return Response.json({ error: "收藏项目无效" }, { status: 400 });
  // 校验结果先落成局部常量：属性上的类型收窄不会穿过下面这个回调的函数边界。
  const row = { email: user.email, itemType: payload.itemType!, itemId: payload.itemId!, active: payload.active };
  await withDbDeadline("favorites.write", (db) => db.insert(favorites).values(row).onConflictDoUpdate({ target: [favorites.email, favorites.itemType, favorites.itemId], set: { active: row.active, updatedAt: new Date().toISOString() } }));
  return Response.json({ active: row.active });
});
