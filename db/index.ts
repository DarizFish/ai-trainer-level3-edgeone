import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type PostgresClient = ReturnType<typeof postgres>;
type Database = ReturnType<typeof drizzle<typeof schema>>;

const DATABASE_OPERATION_TIMEOUT_MS = 8_000;
const DEFAULT_DATABASE_POOL_MAX = 1;
const MAX_DATABASE_POOL_MAX = 20;

/**
 * 连续多少次纯语句超时才判定连接本身卡死、需要退掉整个 client。
 *
 * 阈值不能是 1。退 client 走的是 `end({ timeout: 0 })`，会把当时**所有**在途和排队
 * 的查询一起拒掉。在 EdgeOne 上这只影响当前函数实例（自己的 globalThis、`max: 1`），
 * 代价很小；在阿里云是单个常驻进程、整站共用一个 client，一次超时就会波及所有用户。
 * 单条语句慢和连接坏掉必须区别对待：前者只让该请求失败，后者才退连接。
 */
const DEADLINE_RETIREMENT_THRESHOLD = 3;

const databaseGlobal = globalThis as typeof globalThis & {
  aiTrainerDatabase?: Database;
  aiTrainerPostgres?: PostgresClient;
  aiTrainerConsecutiveDeadlines?: number;
};

function getPostgresClient(): PostgresClient {
  if (databaseGlobal.aiTrainerPostgres) return databaseGlobal.aiTrainerPostgres;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");

  databaseGlobal.aiTrainerPostgres = postgres(connectionString, {
    // EdgeOne stops an invocation after 30 seconds; Nginx cuts the self-hosted
    // proxy at 120. Fail connection startup well before the tighter of the two
    // so callers can return a retryable response on either platform.
    connect_timeout: 5,
    idle_timeout: 20,
    keep_alive: 10,
    max: databasePoolMax(),
    prepare: false,
  });
  return databaseGlobal.aiTrainerPostgres;
}

function databasePoolMax(): number {
  const configured = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10);
  if (!Number.isInteger(configured) || configured < 1) return DEFAULT_DATABASE_POOL_MAX;
  return Math.min(configured, MAX_DATABASE_POOL_MAX);
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
 * Bound every request-facing database operation below the platform's request
 * timeout so callers get a retryable 503 instead of a hung request.
 *
 * 超时本身不再退 client。原先的写法是「一次超时立刻 `end({ timeout: 0 })`」，那是按
 * EdgeOne 的 `max: 1` 设计的：一个函数实例只有一条连接，超时的查询会把后续查询全部
 * 堵在它后面，退掉反而是最快的解法，而且炸不到别的实例。自托管是单进程共用一个
 * client，同样的动作会把所有用户的在途查询一起拒掉——一个大草稿用户反复超时就能拖垮
 * 全站的数据库层。
 *
 * 现在按原因分流：真正的连接故障立即退；纯语句超时只让该请求失败，连续
 * `DEADLINE_RETIREMENT_THRESHOLD` 次才认为连接确实卡死并退掉，避免连接被永久占住。
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
    const result = await Promise.race([
      Promise.resolve().then(() => run(db)),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => {
          reject(new DatabaseDeadlineError(operation, timeoutMs));
        }, timeoutMs);
      }),
    ]);
    // 一次成功就说明连接是活的，之前的超时是慢查询而不是卡死。
    if (databaseGlobal.aiTrainerPostgres === client) databaseGlobal.aiTrainerConsecutiveDeadlines = 0;
    return result;
  } catch (cause) {
    if (cause instanceof DatabaseDeadlineError) {
      noteDeadlineExceeded(client, operation, cause, Date.now() - startedAt);
    } else if (isConnectionFailure(cause)) {
      retireDatabaseClient(client, operation, cause, Date.now() - startedAt);
    }
    throw cause;
  } finally {
    if (deadline) clearTimeout(deadline);
  }
}

/**
 * 记一次纯语句超时。只有连续超过阈值才退 client——单次超时退连接会把同一进程里其他
 * 用户的在途查询一起拒掉，代价远大于收益。
 */
function noteDeadlineExceeded(
  client: PostgresClient,
  operation: string,
  cause: DatabaseDeadlineError,
  elapsedMs: number,
): void {
  // 已经有新 client 顶上时，这次超时属于上一条连接，不再计入也不做处置。
  if (databaseGlobal.aiTrainerPostgres !== client) return;

  const consecutive = (databaseGlobal.aiTrainerConsecutiveDeadlines ?? 0) + 1;
  databaseGlobal.aiTrainerConsecutiveDeadlines = consecutive;

  if (consecutive < DEADLINE_RETIREMENT_THRESHOLD) {
    console.error("Database operation exceeded its deadline", {
      operation,
      elapsedMs,
      consecutive,
      ...errorSummary(cause),
    });
    return;
  }

  retireDatabaseClient(client, operation, cause, elapsedMs);
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
  databaseGlobal.aiTrainerConsecutiveDeadlines = 0;
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
