import { getAccountUser } from "@/lib/account-auth";

export async function requireApiUser() {
  return await getAccountUser();
}

export function unauthorized() {
  return Response.json({ error: "请先登录账号" }, { status: 401 });
}
