import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { favorites } from "@/db/schema";
import { theoryById, practicalByCode } from "@/lib/content";
import { requireApiUser, unauthorized } from "@/lib/server-user";

export async function GET() {
  const user = await requireApiUser(); if (!user) return unauthorized();
  const rows = await getDb().select().from(favorites).where(and(eq(favorites.email, user.email), eq(favorites.active, true)));
  return Response.json({ favorites: rows });
}

export async function POST(request: Request) {
  const user = await requireApiUser(); if (!user) return unauthorized();
  const payload = await request.json() as { itemType?: string; itemId?: string; active?: boolean };
  const valid = payload.itemType === "theory" ? Boolean(payload.itemId && theoryById.has(payload.itemId)) : payload.itemType === "practical" ? Boolean(payload.itemId && practicalByCode.has(payload.itemId)) : false;
  if (!valid || typeof payload.active !== "boolean") return Response.json({ error: "收藏项目无效" }, { status: 400 });
  await getDb().insert(favorites).values({ email: user.email, itemType: payload.itemType!, itemId: payload.itemId!, active: payload.active }).onConflictDoUpdate({ target: [favorites.email, favorites.itemType, favorites.itemId], set: { active: payload.active, updatedAt: new Date().toISOString() } });
  return Response.json({ active: payload.active });
}
