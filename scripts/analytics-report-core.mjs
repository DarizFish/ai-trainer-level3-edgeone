const EVENT_NAMES = new Set([
  "account.registered", "account.login_succeeded", "theory.answers_saved",
  "theory.exam_submitted", "business.operation_failed", "page.viewed",
  "lab.environment_ready", "lab.environment_failed",
]);

function increment(target, key) {
  target[key] = (target[key] ?? 0) + 1;
}

export function createEventSummary(fromMs, toMs) {
  const seen = new Set();
  const summary = {
    input_lines: 0, accepted: 0, duplicates: 0, invalid: 0, outside_window: 0,
    first_received_at: null, last_received_at: null,
    by_event: {}, by_revision: {}, pages: {}, lab_ready_by_task: {}, lab_failed_by_reason: {},
    operation_failures: {}, answers_saved_questions: 0,
  };
  return {
    addLine(line) {
      summary.input_lines += 1;
      let event;
      try {
        const record = JSON.parse(line);
        event = typeof record.MESSAGE === "string" ? JSON.parse(record.MESSAGE) : record;
      } catch { summary.invalid += 1; return; }
      if (event.schema_version !== 1 || !EVENT_NAMES.has(event.event_name) ||
          typeof event.event_id !== "string" || typeof event.received_at !== "string" ||
          !["browser", "server"].includes(event.source)) {
        summary.invalid += 1;
        return;
      }
      const received = Date.parse(event.received_at);
      if (!Number.isFinite(received)) { summary.invalid += 1; return; }
      if (received < fromMs || received >= toMs) { summary.outside_window += 1; return; }
      if (seen.has(event.event_id)) { summary.duplicates += 1; return; }
      seen.add(event.event_id);
      summary.accepted += 1;
      summary.first_received_at = summary.first_received_at === null || event.received_at < summary.first_received_at ? event.received_at : summary.first_received_at;
      summary.last_received_at = summary.last_received_at === null || event.received_at > summary.last_received_at ? event.received_at : summary.last_received_at;
      increment(summary.by_event, event.event_name);
      increment(summary.by_revision, /^[0-9a-f]{40}$/.test(event.release_revision ?? "") ? event.release_revision : "unknown");
      if (event.event_name === "page.viewed" && typeof event.route_id === "string") increment(summary.pages, event.route_id);
      if (event.event_name === "lab.environment_ready" && typeof event.task_code === "string") increment(summary.lab_ready_by_task, event.task_code);
      if (event.event_name === "lab.environment_failed" && typeof event.reason_code === "string") increment(summary.lab_failed_by_reason, event.reason_code);
      if (event.event_name === "business.operation_failed" && typeof event.operation === "string" && typeof event.reason_code === "string") {
        increment(summary.operation_failures, `${event.operation}:${event.reason_code}`);
      }
      if (event.event_name === "theory.answers_saved" && Number.isInteger(event.question_count) && event.question_count >= 0) {
        summary.answers_saved_questions += event.question_count;
      }
    },
    result() { return summary; },
  };
}

export function createAccessSummary(fromMs, toMs) {
  const summary = { input_lines: 0, accepted: 0, invalid: 0, outside_window: 0, status_classes: {}, api_status_classes: {}, slow_requests_1000ms: 0, max_request_ms: 0 };
  return {
    addLine(line) {
      summary.input_lines += 1;
      // The access log deliberately retains its existing prefix for incident tooling.
      const match = /\[(\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2} [+-]\d{4})\] "([A-Z]+) ([^ ]+) [^"]+" (\d{3}) \d+ "[^"]*" "[^"]*" rt=([0-9.]+)$/.exec(line);
      if (!match) { summary.invalid += 1; return; }
      const received = parseNginxTime(match[1]);
      if (!Number.isFinite(received)) { summary.invalid += 1; return; }
      if (received < fromMs || received >= toMs) { summary.outside_window += 1; return; }
      summary.accepted += 1;
      const statusClass = `${match[4][0]}xx`;
      increment(summary.status_classes, statusClass);
      if (match[3].startsWith("/api/")) increment(summary.api_status_classes, statusClass);
      const duration = Math.round(Number(match[5]) * 1000);
      if (duration >= 1000) summary.slow_requests_1000ms += 1;
      summary.max_request_ms = Math.max(summary.max_request_ms, duration);
    },
    result() { return summary; },
  };
}

function parseNginxTime(value) {
  const match = /^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/.exec(value);
  if (!match) return NaN;
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(match[2]);
  if (month < 0) return NaN;
  const local = Date.UTC(Number(match[3]), month, Number(match[1]), Number(match[4]), Number(match[5]), Number(match[6]));
  const offset = (Number(match[8]) * 60 + Number(match[9])) * 60_000 * (match[7] === "+" ? 1 : -1);
  return local - offset;
}
