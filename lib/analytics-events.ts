export const PAGE_ROUTE_IDS = [
  "home", "theory", "theory_mock", "practical", "practical_mock",
  "practical_task", "practical_lab", "progress", "resources", "account",
] as const;

export type PageRouteId = typeof PAGE_ROUTE_IDS[number];
export type LabFailureReason = "iframe_timeout" | "iframe_connect" | "state_timeout" | "prepare_failed" | "kernel_failed";

export type BrowserEvent =
  | { event_name: "page.viewed"; route_id: PageRouteId; occurred_at: string }
  | { event_name: "lab.environment_ready"; task_code: string; load_generation: number; duration_ms: number; occurred_at: string }
  | { event_name: "lab.environment_failed"; task_code: string; load_generation: number; duration_ms: number; reason_code: LabFailureReason; occurred_at: string };

export function pageRouteId(pathname: string): PageRouteId | null {
  const fixed: Record<string, PageRouteId> = {
    "/": "home", "/theory": "theory", "/theory/mock": "theory_mock",
    "/practical": "practical", "/practical/mock": "practical_mock",
    "/progress": "progress", "/resources": "resources", "/account": "account",
  };
  if (fixed[pathname]) return fixed[pathname];
  if (/^\/practical\/\d+\.\d+\.\d+\/lab$/.test(pathname)) return "practical_lab";
  if (/^\/practical\/\d+\.\d+\.\d+$/.test(pathname)) return "practical_task";
  return null;
}

export function parseBrowserEvent(value: unknown, validTaskCode: (code: string) => boolean): BrowserEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.occurred_at !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(item.occurred_at)) return null;
  const occurredAt = Date.parse(item.occurred_at);
  if (!Number.isFinite(occurredAt) || occurredAt > Date.now() + 5 * 60_000 || occurredAt < Date.now() - 7 * 86400_000) return null;

  if (item.event_name === "page.viewed") {
    if (Object.keys(item).length !== 3 || !PAGE_ROUTE_IDS.includes(item.route_id as PageRouteId)) return null;
    return { event_name: "page.viewed", route_id: item.route_id as PageRouteId, occurred_at: item.occurred_at };
  }

  if (item.event_name !== "lab.environment_ready" && item.event_name !== "lab.environment_failed") return null;
  if (typeof item.task_code !== "string" || !validTaskCode(item.task_code)) return null;
  if (!Number.isInteger(item.load_generation) || (item.load_generation as number) < 0 || (item.load_generation as number) > 100) return null;
  if (!Number.isInteger(item.duration_ms) || (item.duration_ms as number) < 0 || (item.duration_ms as number) > 300_000) return null;
  const common = {
    task_code: item.task_code,
    load_generation: item.load_generation as number,
    duration_ms: item.duration_ms as number,
    occurred_at: item.occurred_at,
  };
  if (item.event_name === "lab.environment_ready") {
    return Object.keys(item).length === 5 ? { event_name: "lab.environment_ready", ...common } : null;
  }
  const reasons: LabFailureReason[] = ["iframe_timeout", "iframe_connect", "state_timeout", "prepare_failed", "kernel_failed"];
  if (Object.keys(item).length !== 6 || !reasons.includes(item.reason_code as LabFailureReason)) return null;
  return { event_name: "lab.environment_failed", reason_code: item.reason_code as LabFailureReason, ...common };
}
