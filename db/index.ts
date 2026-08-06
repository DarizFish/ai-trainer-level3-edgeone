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

/**
 * 这次失败是「数据库暂时够不着」还是「这条语句本身有问题」。前者应答 503 让客户端
 * 重试，后者是缺陷，必须原样抛出去暴露成 500——把两者混为一谈会让约束冲突、语法
 * 错误这类问题伪装成网络抖动，线上再也查不出来。
 */
export function isDatabaseUnavailable(cause: unknown): boolean {
  return isConnectionFailure(cause);
}

const CONNECTION_FAILURE =
  /CONNECT_TIMEOUT|CONNECTION_(?:CLOSED|DESTROYED)|ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|ENETUNREACH|ENOTFOUND|57P0[123]/i;

/**
 * 必须顺着 `cause` 链找，不能只看最外层。Drizzle 把驱动错误重新包过一层，抛出来的是
 * `Error: Failed query: INSERT INTO ...`，既没有 `code`，消息里也只有 SQL；真正的
 * `CONNECT_TIMEOUT` 挂在它的 `cause` 上。只看外层的话每一次连接故障都会被当成普通
 * 语句错误——那条已经坏掉的连接不会被退掉，客户端也拿不到可重试的 503。
 */
function isConnectionFailure(cause: unknown): boolean {
  if (cause instanceof DatabaseDeadlineError) return true;
  return walkCauses(cause).some((error) => CONNECTION_FAILURE.test(`${error.code} ${error.message}`));
}

/** 最外层的 name/message 最好读，但 `code` 往往只在链底，取第一个拿得到的。 */
export function errorSummary(cause: unknown): { name: string; code: string; message: string } {
  const chain = walkCauses(cause);
  const outermost = chain[0];
  return {
    ...outermost,
    code: chain.find((error) => error.code !== "UNKNOWN")?.code ?? "UNKNOWN",
  };
}

function walkCauses(cause: unknown): { name: string; code: string; message: string }[] {
  const chain: { name: string; code: string; message: string }[] = [];
  const seen = new Set<unknown>();
  let current: unknown = cause;

  // 深度设上限并去重：`cause` 允许成环，走进环里就再也出不来了。
  for (let depth = 0; current && depth < 8 && !seen.has(current); depth += 1) {
    seen.add(current);
    if (current instanceof Error) {
      const code = "code" in current ? String((current as Error & { code?: unknown }).code ?? "UNKNOWN") : "UNKNOWN";
      chain.push({ name: current.name, code, message: current.message });
      current = current.cause;
    } else {
      chain.push({ name: "Error", code: "UNKNOWN", message: String(current) });
      current = null;
    }
  }

  return chain.length ? chain : [{ name: "Error", code: "UNKNOWN", message: String(cause) }];
}
