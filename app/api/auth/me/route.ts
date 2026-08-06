import { getAccountUser } from "@/lib/account-auth";
import { withDatabaseErrors } from "@/lib/api-db";

export const dynamic = "force-dynamic";

export const GET = withDatabaseErrors("account.me", async () => {
  const user = await getAccountUser();
  return Response.json(
    { user },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}, "账号状态暂时无法确认，请稍后重试");
