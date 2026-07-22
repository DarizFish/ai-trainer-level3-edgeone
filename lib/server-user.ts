import { getAccountUser } from "@/lib/account-auth";
import { getDb } from "@/db";
import { users } from "@/db/schema";

export async function requireApiUser() {
  const user = await getAccountUser();
  if (!user) return null;
  const db = getDb();
  await db.insert(users).values({ email: user.email, displayName: user.displayName }).onConflictDoUpdate({ target: users.email, set: { displayName: user.displayName, updatedAt: new Date().toISOString() } });
  return user;
}

export function unauthorized() {
  return Response.json({ error: "请先登录账号" }, { status: 401 });
}
