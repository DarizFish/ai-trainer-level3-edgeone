import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import postgres from "postgres";
import { createAccessSummary, createEventSummary } from "./analytics-report-core.mjs";

function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i]?.startsWith("--") || !args[i + 1]) throw new Error("Usage: analytics-report --from ISO --to ISO --events FILE [--access FILE] [--revision SHA] [--output FILE]");
    result[args[i].slice(2)] = args[i + 1];
  }
  if (!result.from || !result.to || !result.events) throw new Error("--from, --to and --events are required");
  if (![result.from, result.to].every(value => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value))) {
    throw new Error("--from and --to need an explicit time zone");
  }
  const fromMs = Date.parse(result.from);
  const toMs = Date.parse(result.to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs || toMs - fromMs > 31 * 86400_000) throw new Error("Invalid report window (maximum 31 days)");
  if (result.revision && !/^[0-9a-f]{40}$/.test(result.revision)) throw new Error("--revision must be a full Git SHA");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return { ...result, fromMs, toMs };
}

async function readLines(file, addLine) {
  const source = file === "-" ? process.stdin : createReadStream(file, { encoding: "utf8" });
  for await (const line of createInterface({ input: source, crlfDelay: Infinity })) {
    if (line) addLine(line);
  }
}

async function databaseSummary(from, to) {
  const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10, idle_timeout: 5, prepare: false });
  try {
    return await sql.begin(async tx => {
      await tx`set transaction read only`;
      await tx`set local statement_timeout = '20s'`;
      const [accounts] = await tx`select count(*)::integer as current_accounts, count(*) filter (where created_at >= ${from} and created_at < ${to})::integer as created_and_still_present from users`;
      const [progress] = await tx`select count(distinct email)::integer as accounts_with_progress, count(*)::integer as current_question_rows from theory_progress`;
      const progressByVersion = await tx`select content_version, count(distinct email)::integer as accounts_with_progress, count(*)::integer as question_rows, round(count(*)::numeric / nullif(count(distinct email), 0), 2)::double precision as average_questions_per_account from theory_progress group by content_version order by content_version`;
      const attempts = await tx`select mode, content_version, count(*)::integer as submissions, count(*) filter (where passed)::integer as passed, round(avg(score / nullif(max_score, 0))::numeric, 4)::double precision as average_score_ratio from theory_attempts where created_at >= ${from} and created_at < ${to} group by mode, content_version order by mode, content_version`;
      return { accounts, progress, progress_by_version: progressByVersion, attempts, submitted_total: attempts.reduce((sum, row) => sum + row.submissions, 0) };
    });
  } finally { await sql.end({ timeout: 5 }); }
}

const args = options(process.argv.slice(2));
const events = createEventSummary(args.fromMs, args.toMs);
const access = args.access ? createAccessSummary(args.fromMs, args.toMs) : null;
await readLines(args.events, line => events.addLine(line));
if (access) await readLines(args.access, line => access.addLine(line));
const database = await databaseSummary(new Date(args.fromMs).toISOString(), new Date(args.toMs).toISOString());
const eventSummary = events.result();
const generatedAt = new Date();
const report = {
  schema_version: 1,
  generated_at: generatedAt.toISOString(),
  window: { from: new Date(args.fromMs).toISOString(), to: new Date(args.toMs).toISOString(), display_timezone: "Asia/Shanghai", complete: args.toMs <= generatedAt.getTime() },
  active_revision_at_generation: args.revision ?? null,
  source: { events: args.events, access: args.access ?? null, note: "Log counts are observations, not unique people. Export completeness must be checked separately." },
  events: eventSummary,
  access: access?.result() ?? null,
  database,
  reconciliation: {
    exam_event_count: eventSummary.by_event["theory.exam_submitted"] ?? 0,
    database_submission_count: database.submitted_total,
    difference: (eventSummary.by_event["theory.exam_submitted"] ?? 0) - database.submitted_total,
    note: "A difference may reflect collection gaps, retries or a database commit after an application timeout; the database is the source of truth for saved submissions.",
  },
};
const output = JSON.stringify(report, null, 2) + "\n";
if (args.output) await writeFile(args.output, output, { mode: 0o600 });
else process.stdout.write(output);
