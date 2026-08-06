import { withDatabaseErrors } from "@/lib/api-db";
import { getProgressData } from "@/lib/progress-data";
import { requireApiUser, unauthorized } from "@/lib/server-user";

export const dynamic = "force-dynamic";

export const GET = withDatabaseErrors("progress.read", async () => {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  return Response.json(await getProgressData(user.email));
});
