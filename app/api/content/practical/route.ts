import { content } from "@/lib/content";

export const dynamic = "force-static";
export const revalidate = false;

export function GET() {
  return Response.json(
    {
      version: content.version,
      tasks: content.practical,
      officialTaskCodes: content.officialPracticalMockCodes,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "CDN-Cache-Control": "public, max-age=31536000, immutable",
      },
    },
  );
}
