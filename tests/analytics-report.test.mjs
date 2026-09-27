import assert from "node:assert/strict";
import test from "node:test";
import { createAccessSummary, createEventSummary } from "../scripts/analytics-report-core.mjs";

test("journal and plain JSON events are deduplicated and bounded by receive time", () => {
  const from = Date.parse("2026-09-26T16:00:00Z");
  const to = from + 86400_000;
  const counter = createEventSummary(from, to);
  const revision = "a".repeat(40);
  const event = { schema_version: 1, event_id: "one", received_at: "2026-09-27T00:00:00.000Z", release_revision: revision, source: "server", event_name: "theory.exam_submitted" };
  counter.addLine(JSON.stringify({ MESSAGE: JSON.stringify(event) }));
  counter.addLine(JSON.stringify(event));
  counter.addLine(JSON.stringify({ ...event, event_id: "two", received_at: "2026-09-28T00:00:00.000Z" }));
  assert.equal(counter.result().accepted, 1);
  assert.equal(counter.result().duplicates, 1);
  assert.equal(counter.result().outside_window, 1);
  assert.equal(counter.result().by_event["theory.exam_submitted"], 1);
  assert.equal(counter.result().by_revision[revision], 1);
});

test("access summary excludes requests outside the same UTC window", () => {
  const counter = createAccessSummary(Date.parse("2026-09-26T16:00:00Z"), Date.parse("2026-09-27T16:00:00Z"));
  counter.addLine('1.2.3.4 via=5.6.7.8 - - [27/Sep/2026:12:00:00 +0800] "GET /api/health/ready HTTP/1.1" 503 10 "-" "curl" rt=1.234');
  counter.addLine('1.2.3.4 via=5.6.7.8 - - [28/Sep/2026:12:00:00 +0800] "GET / HTTP/1.1" 200 10 "-" "curl" rt=0.001');
  assert.equal(counter.result().accepted, 1);
  assert.equal(counter.result().api_status_classes["5xx"], 1);
  assert.equal(counter.result().slow_requests_1000ms, 1);
  assert.equal(counter.result().max_request_ms, 1234);
});
