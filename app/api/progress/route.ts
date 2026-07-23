import { getProgressData } from "@/lib/progress-data";
import { requireApiUser, unauthorized } from "@/lib/server-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  // The shared query returns practicalAbility and estimatedPracticalScore.
  return Response.json(await getProgressData(user.email));
}
