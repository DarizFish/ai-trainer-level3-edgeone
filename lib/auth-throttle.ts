import { sql } from "drizzle-orm";
import { getDb } from "@/db";

/**
 * 注册与登录的限流。挡的是两件事：
 *
 * 1. **CPU 放大**。每次凭据校验都要跑 100,000 轮 PBKDF2（见 account-auth.ts），
 *    几十并发就能把 EdgeOne 函数占满，正常用户全部登录失败。所以 IP 额度必须在
 *    调用 verifyPassword / createPasswordRecord **之前**扣，扣不动就直接 429，
 *    这样单个来源能引发的哈希计算量有上界。
 * 2. **灌注册**。开放注册接口不设限，脚本可以把 Supabase 的行数额度写满。
 *
 * 计数落库而不是放进程内存：EdgeOne 函数是多实例的，内存计数各数各的，攻击者
 * 只要并发就能把每个实例的额度分别用满，等于没限。
 */

export type ThrottleVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type ThrottlePolicy = { limit: number; windowSeconds: number };

/**
 * 默认就是 `getDb()`。留这个参数是为了能把调用放进事务里跑——下面两条语句用了
 * `make_interval` 和 `ON CONFLICT ... CASE`，本地没有 Postgres 可验，只能开事务
 * 打到真库上跑完再回滚。
 */
export type ThrottleExecutor = Pick<ReturnType<typeof getDb>, "execute">;

/** 同一 IP 每小时最多注册 5 个账号。够覆盖公司/学校 NAT 出口后面的正常同学。 */
export const REGISTER_PER_ADDRESS: ThrottlePolicy = { limit: 5, windowSeconds: 3600 };

/** 同一 IP 每 15 分钟最多 20 次登录尝试，成功与否都算——这是 CPU 上界。 */
export const LOGIN_PER_ADDRESS: ThrottlePolicy = { limit: 20, windowSeconds: 900 };

/**
 * 同一邮箱每 15 分钟最多 10 次**失败**。只记失败，正常登录的人永远碰不到。
 * 针对的是换着 IP 打同一个账号的撞库，per-IP 额度对这种打法无效。
 */
export const LOGIN_FAILURES_PER_EMAIL: ThrottlePolicy = { limit: 10, windowSeconds: 900 };

/**
 * 只有 EdgeOne 边缘节点写入的 `EO-Connecting-IP` 是不可伪造的。`X-Forwarded-For`
 * 会把客户端自带的值一并透传，最左位由攻击者控制，用它限流等于让对方自己发号，
 * 所以它只作为本地开发和非 EdgeOne 环境的兜底。
 * 参见 https://cloud.tencent.com/document/product/1552/87654
 */
const TRUSTED_ADDRESS_HEADERS = ["eo-connecting-ip", "x-real-ip"];

export function clientAddress(request: Request): string {
  for (const name of TRUSTED_ADDRESS_HEADERS) {
    const value = request.headers.get(name)?.trim();
    if (value) return value;
  }
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

/**
 * 扣一次额度并返回是否放行。整个「读旧值 / 判断窗口是否过期 / 累加或重置」在单条
 * 语句里完成，并发下不会互相覆盖。窗口过期是写入时原地重置的，不需要定时任务。
 */
export async function consumeThrottle(bucket: string, policy: ThrottlePolicy, db: ThrottleExecutor = getDb()): Promise<ThrottleVerdict> {
  const window = sql`make_interval(secs => ${policy.windowSeconds}::float8)`;
  const rows = await db.execute<{ count: number; retry_after: number }>(sql`
    INSERT INTO auth_throttle (bucket, count, window_start)
    VALUES (${bucket}, 1, now())
    ON CONFLICT (bucket) DO UPDATE SET
      count = CASE WHEN auth_throttle.window_start > now() - ${window} THEN auth_throttle.count + 1 ELSE 1 END,
      window_start = CASE WHEN auth_throttle.window_start > now() - ${window} THEN auth_throttle.window_start ELSE now() END
    RETURNING count, ceil(extract(epoch from (window_start + ${window} - now())))::int AS retry_after
  `);
  return verdict(rows[0]?.count ?? 1, rows[0]?.retry_after ?? policy.windowSeconds, policy);
}

/**
 * 只读地看一眼额度，不扣。用于「失败才计数」的邮箱额度：进门时先看是否已经超限，
 * 超了就挡住。挡住的这次不计数，否则攻击者可以靠持续敲门把受害者的锁定无限续期。
 */
export async function peekThrottle(bucket: string, policy: ThrottlePolicy, db: ThrottleExecutor = getDb()): Promise<ThrottleVerdict> {
  const window = sql`make_interval(secs => ${policy.windowSeconds}::float8)`;
  const rows = await db.execute<{ count: number; retry_after: number }>(sql`
    SELECT count, ceil(extract(epoch from (window_start + ${window} - now())))::int AS retry_after
    FROM auth_throttle
    WHERE bucket = ${bucket} AND window_start > now() - ${window}
  `);
  if (!rows[0]) return { allowed: true };
  return verdict(rows[0].count, rows[0].retry_after, policy);
}

function verdict(count: number, retryAfter: number, policy: ThrottlePolicy): ThrottleVerdict {
  if (count <= policy.limit) return { allowed: true };
  return { allowed: false, retryAfterSeconds: Math.max(1, retryAfter) };
}

/**
 * 表里每个活跃来源占一行，长期跑会攒下大量早已过期的行。用低概率的顺手清理代替
 * 定时任务：不 await，失败也不影响本次请求。
 */
export function sweepThrottle(): void {
  if (Math.random() >= 0.02) return;
  void getDb()
    .execute(sql`DELETE FROM auth_throttle WHERE window_start < now() - interval '1 day'`)
    .catch(() => { /* 清理是尽力而为，失败不该影响登录。 */ });
}

export function tooManyRequests(retryAfterSeconds: number, what: string): Response {
  return Response.json(
    { error: `${what}过于频繁，请在 ${describeWait(retryAfterSeconds)}后重试`, code: "RATE_LIMITED" },
    { status: 429, headers: { "retry-after": String(retryAfterSeconds) } },
  );
}

function describeWait(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60 ? `${minutes} 分钟` : `${Math.ceil(minutes / 60)} 小时`;
}
