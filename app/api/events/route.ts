import { practicalByCode } from "@/lib/content";
import { parseBrowserEvent } from "@/lib/analytics-events";
import { recordBrowserEvent } from "@/lib/analytics-server";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 512;
const WINDOW_MS = 60_000;
const MAX_PER_SOURCE = 30;
const MAX_TOTAL = 300;
const counters = new Map<string, { count: number; expires: number }>();
let total = { count: 0, expires: 0 };

function withinRateLimit(request: Request): boolean {
  const now = Date.now();
  if (now >= total.expires) total = { count: 0, expires: now + WINDOW_MS };
  if (++total.count > MAX_TOTAL) return false;
  const trustedHeader = process.env.TRUSTED_CLIENT_IP_HEADER?.toLowerCase();
  const source = trustedHeader === "x-real-ip" || trustedHeader === "eo-connecting-ip"
    ? request.headers.get(trustedHeader)?.slice(0, 64) || "unknown"
    : "unknown";
  const previous = counters.get(source);
  const current = previous && now < previous.expires ? previous : { count: 0, expires: now + WINDOW_MS };
  current.count += 1;
  counters.set(source, current);
  if (counters.size > 10_000) {
    for (const [key, value] of counters) if (value.expires <= now) counters.delete(key);
  }
  return current.count <= MAX_PER_SOURCE;
}

async function readSmallBody(request: Request): Promise<string | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) return null;
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch { return null; }
  finally { void reader.cancel().catch(() => undefined); }
}

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  let sameHost = false;
  try {
    const submitted = new URL(origin ?? "");
    // CDN -> origin is HTTP today; compare hosts so the public HTTPS Origin remains valid.
    const host = request.headers.get("host") ?? new URL(request.url).host;
    sameHost = ["http:", "https:"].includes(submitted.protocol) && submitted.host === host;
  } catch { /* Missing or malformed Origin. */ }
  if (!sameHost) return new Response(null, { status: 403 });
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") return new Response(null, { status: 415 });
  if (!withinRateLimit(request)) return new Response(null, { status: 429 });
  const body = await readSmallBody(request);
  if (body === null) return new Response(null, { status: 413 });
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return new Response(null, { status: 400 }); }
  const event = parseBrowserEvent(parsed, code => practicalByCode.has(code));
  if (!event) return new Response(null, { status: 400 });
  recordBrowserEvent(event);
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
