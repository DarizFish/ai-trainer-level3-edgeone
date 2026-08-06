import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type PostgresClient = ReturnType<typeof postgres>;
type Database = ReturnType<typeof drizzle<typeof schema>>;

const DATABASE_OPERATION_TIMEOUT_MS = 8_000;

const databaseGlobal = globalThis as typeof globalThis & {
  aiTrainerDatabase?: Database;
  aiTrainerPostgres?: PostgresClient;
};

function getPostgresClient(): PostgresClient {
  if (databaseGlobal.aiTrainerPostgres) return databaseGlobal.aiTrainerPostgres;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");

  databaseGlobal.aiTrainerPostgres = postgres(connectionString, {
    // EdgeOne stops an invocation after 30 seconds. Fail connection startup
    // well before that boundary so callers can return a retryable response.
    connect_timeout: 5,
    idle_timeout: 20,
    keep_alive: 10,
    max: 1,
    prepare: false,
  });
  return databaseGlobal.aiTrainerPostgres;
}

export function getDb(): Database {
  if (!databaseGlobal.aiTrainerDatabase) {
    databaseGlobal.aiTrainerDatabase = drizzle(getPostgresClient(), { schema });
  }
  return databaseGlobal.aiTrainerDatabase;
}

export class DatabaseDeadlineError extends Error {
  readonly code = "DATABASE_DEADLINE_EXCEEDED";

  constructor(readonly operation: string, readonly timeoutMs: number) {
    super(`Database operation ${operation} exceeded ${timeoutMs}ms`);
    this.name = "DatabaseDeadlineError";
  }
}

/**
 * Bound every request-facing database operation below EdgeOne's invocation
 * timeout. A plain Promise.race is not sufficient here: Postgres.js would keep
 * the timed-out query and every later query queued behind the single pooled
 * connection. Retiring the client rejects that queue and makes the next request
 * establish a clean connection.
 */
export async function withDbDeadline<T>(
  operation: string,
  run: (db: Database) => Promise<T>,
  timeoutMs = DATABASE_OPERATION_TIMEOUT_MS,
): Promise<T> {
  const client = getPostgresClient();
  const db = getDb();
  const startedAt = Date.now();
  let deadline: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve().then(() => run(db)),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => {
          const cause = new DatabaseDeadlineError(operation, timeoutMs);
          retireDatabaseClient(client, operation, cause, Date.now() - startedAt);
          reject(cause);
        }, timeoutMs);
      }),
    ]);
  } catch (cause) {
    if (isConnectionFailure(cause)) {
      retireDatabaseClient(client, operation, cause, Date.now() - startedAt);
    }
    throw cause;
  } finally {
    if (deadline) clearTimeout(deadline);
  }
}

function retireDatabaseClient(
  client: PostgresClient,
  operation: string,
  cause: unknown,
  elapsedMs: number,
): void {
  // A previous failure may already have installed a new client. Never let the
  // old operation tear down that replacement.
  if (databaseGlobal.aiTrainerPostgres !== client) return;

  databaseGlobal.aiTrainerDatabase = undefined;
  databaseGlobal.aiTrainerPostgres = undefined;
  const error = errorSummary(cause);
  console.error("Database client retired", { operation, elapsedMs, ...error });
  void client.end({ timeout: 0 }).catch((endCause) => {
    console.error("Database client retirement failed", { operation, ...errorSummary(endCause) });
  });
}

function isConnectionFailure(cause: unknown): boolean {
  if (cause instanceof DatabaseDeadlineError) return true;
  const error = errorSummary(cause);
  return /CONNECT_TIMEOUT|CONNECTION_(?:CLOSED|DESTROYED)|ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|ENETUNREACH|ENOTFOUND|57P0[123]/i
    .test(`${error.code} ${error.message}`);
}

export function errorSummary(cause: unknown): { name: string; code: string; message: string } {
  if (!(cause instanceof Error)) return { name: "Error", code: "UNKNOWN", message: String(cause) };
  const code = "code" in cause ? String((cause as Error & { code?: unknown }).code ?? "UNKNOWN") : "UNKNOWN";
  return { name: cause.name, code, message: cause.message };
}
