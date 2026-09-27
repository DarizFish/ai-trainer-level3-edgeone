import { randomUUID } from "node:crypto";
import type { BrowserEvent } from "@/lib/analytics-events";

type ServerEvent =
  | { event_name: "account.registered" | "account.login_succeeded" }
  | { event_name: "theory.answers_saved"; question_count: number; content_version: string }
  | { event_name: "theory.exam_submitted"; mode: "official" | "random"; content_version: string }
  | { event_name: "business.operation_failed"; operation: string; reason_code: "database_unavailable" | "internal_error" };

function writeEvent(event: BrowserEvent | ServerEvent, source: "browser" | "server"): void {
  try {
    const revision = process.env.APP_REVISION;
    console.info(JSON.stringify({
      schema_version: 1,
      event_id: randomUUID(),
      received_at: new Date().toISOString(),
      ...(revision && /^[0-9a-f]{40}$/.test(revision) ? { release_revision: revision } : {}),
      source,
      outcome: event.event_name === "page.viewed" ? "observed" : event.event_name.endsWith("_failed") ? "failure" : "success",
      ...event,
    }));
  } catch { /* Log output cannot affect a successful database write or browser request. */ }
}

export function recordServerEvent(event: ServerEvent): void { writeEvent(event, "server"); }
export function recordBrowserEvent(event: BrowserEvent): void { writeEvent(event, "browser"); }
