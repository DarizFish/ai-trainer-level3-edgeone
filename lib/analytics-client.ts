import type { BrowserEvent } from "@/lib/analytics-events";

/** Browsing and lab observations are best effort; they never block an interaction. */
export function reportBrowserEvent(event: BrowserEvent): void {
  try {
    void fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      credentials: "omit",
      keepalive: true,
    }).catch(() => undefined);
  } catch { /* Telemetry must not change the page result. */ }
}
