import { createHash } from "node:crypto";
import assets from "@/data/content-assets.json";
import { examBlueprint } from "@/lib/exam-blueprint";

export function GET() {
  const asset = (path: string) => ({ path, sha256Prefix: path.match(/\.([a-f0-9]{16})\.json$/)?.[1] });
  return Response.json({
    schemaVersion: 1,
    version: assets.version,
    contentId: createHash("sha256").update(assets.theory).digest("hex"),
    theory: asset(assets.theory),
    practical: asset(assets.miniprogramPractical),
    exam: examBlueprint.theory,
    passingScore: examBlueprint.passingScore,
    capabilities: { idempotentSubmissions: true },
  }, { headers: { "Cache-Control": "no-cache, must-revalidate" } });
}
