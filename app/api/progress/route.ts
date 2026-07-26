import { getProgressData } from "@/lib/progress-data";
import { requireApiUser, unauthorized } from "@/lib/server-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  return Response.json(await getProgressData(user.email));
}
