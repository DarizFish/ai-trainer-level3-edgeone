import { eq } from "drizzle-orm";
import { isDatabaseUnavailable, withDbDeadline } from "@/db";
import { users } from "@/db/schema";
import { describeErrorChain, ensureAccountSchema } from "@/lib/account-schema";
import {
  createPasswordRecord,
  createSession,
  isSecureRequest,
  isValidEmail,
  isValidPassword,
  normalizeEmail,
  serializeSessionCookie,
} from "@/lib/account-auth";
import {
  REGISTER_PER_ADDRESS,
  clientAddress,
  consumeThrottle,
  sweepThrottle,
  tooManyRequests,
} from "@/lib/auth-throttle";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as { displayName?: unknown; email?: unknown; password?: unknown } | null;
  const email = normalizeEmail(typeof payload?.email === "string" ? payload.email : "");
  const password = typeof payload?.password === "string" ? payload.password : "";
  const requestedName = typeof payload?.displayName === "string" ? payload.displayName.trim() : "";

  if (!isValidEmail(email)) return Response.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
  if (!isValidPassword(password)) return Response.json({ error: "密码长度应为 8–128 个字符" }, { status: 400 });
  if (requestedName.length > 60) return Response.json({ error: "昵称不能超过 60 个字符" }, { status: 400 });

  let stage: "schema" | "throttle" | "lookup" | "password" | "user-write" | "session-write" = "schema";
  try {
    await ensureAccountSchema();

    // 额度要在 createPasswordRecord 之前扣：那一步是 10 万轮 PBKDF2，先扣额度才能
    // 给单个来源能引发的哈希计算量封顶。
    stage = "throttle";
    const quota = await consumeThrottle(`register:ip:${clientAddress(request)}`, REGISTER_PER_ADDRESS);
    if (!quota.allowed) return tooManyRequests(quota.retryAfterSeconds, "注册");
    sweepThrottle();

    stage = "lookup";
    const [existing] = await withDbDeadline("account.register.lookup", (db) => db.select({ email: users.email }).from(users).where(eq(users.email, email)).limit(1));
    if (existing) return Response.json({ error: "该邮箱已注册，或属于尚未迁移的旧账号" }, { status: 409 });

    stage = "password";
    const passwordRecord = await createPasswordRecord(password);
    const displayName = requestedName || email.split("@")[0];
    stage = "user-write";
    await withDbDeadline("account.register.insert", (db) => db.insert(users).values({
      email,
      displayName,
      passwordHash: passwordRecord.hash,
      passwordSalt: passwordRecord.salt,
      passwordIterations: passwordRecord.iterations,
    }));

    try {
      stage = "session-write";
      const session = await createSession(email);
      const response = Response.json({ user: { email, displayName } }, { status: 201 });
      response.headers.set("set-cookie", serializeSessionCookie(session.token, isSecureRequest(request)));
      return response;
    } catch (cause) {
      // Avoid leaving an unusable account behind if session creation fails.
      try {
        await withDbDeadline("account.register.rollback", (db) => db.delete(users).where(eq(users.email, email)));
      } catch { /* Preserve the original session error. */ }
      throw cause;
    }
  } catch (cause) {
    const message = describeErrorChain(cause);
    console.error("Account registration failed", cause);
    if (/unique constraint|already exists/i.test(message)) return Response.json({ error: "该邮箱已注册" }, { status: 409 });
    // 超时错误的文案对不上下面那条正则（它匹配的是连接类字样），单独判一次，
    // 否则 deadline 触发时会掉进末尾的 500，客户端不会重试。
    if (isDatabaseUnavailable(cause) || /relation .* does not exist|postgres|database|DATABASE_URL|ECONN|ENOTFOUND|connect|SSL|TLS|password authentication failed/i.test(message)) {
      return Response.json({ error: "账号数据库暂时不可用，请稍后重试", code: `REGISTER_${stage.toUpperCase()}` }, { status: 503 });
    }
    if (stage === "password") {
      return Response.json({ error: "密码安全计算暂时不可用，请稍后重试", code: "REGISTER_PASSWORD" }, { status: 503 });
    }
    return Response.json({ error: `账号服务暂时不可用（REGISTER_${stage.toUpperCase()}）`, code: `REGISTER_${stage.toUpperCase()}` }, { status: 500 });
  }
}
