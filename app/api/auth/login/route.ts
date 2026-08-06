import { eq } from "drizzle-orm";
import { isDatabaseUnavailable, withDbDeadline } from "@/db";
import { users } from "@/db/schema";
import { describeErrorChain, ensureAccountSchema } from "@/lib/account-schema";
import {
  createSession,
  isSecureRequest,
  isValidEmail,
  normalizeEmail,
  serializeSessionCookie,
  verifyPassword,
} from "@/lib/account-auth";
import {
  LOGIN_FAILURES_PER_EMAIL,
  LOGIN_PER_ADDRESS,
  clientAddress,
  consumeThrottle,
  peekThrottle,
  sweepThrottle,
  tooManyRequests,
} from "@/lib/auth-throttle";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as { email?: unknown; password?: unknown } | null;
  const email = normalizeEmail(typeof payload?.email === "string" ? payload.email : "");
  const password = typeof payload?.password === "string" ? payload.password : "";
  if (!isValidEmail(email) || !password) return invalidCredentials();

  const failureBucket = `login:email:${email}`;
  let stage: "schema" | "throttle" | "lookup" | "password" | "session-write" = "schema";
  try {
    await ensureAccountSchema();

    // 两道额度都必须在 verifyPassword 之前判：那一步无论账号存不存在都会跑满
    // 10 万轮 PBKDF2（不存在时用 DUMMY_SALT 走等时路径），是本接口唯一的重活。
    stage = "throttle";
    const addressQuota = await consumeThrottle(`login:ip:${clientAddress(request)}`, LOGIN_PER_ADDRESS);
    if (!addressQuota.allowed) return tooManyRequests(addressQuota.retryAfterSeconds, "登录尝试");
    // 邮箱额度只在失败时累加，所以这里是只读查看。挡住的这次不计数，否则攻击者
    // 可以靠持续敲门把受害者的锁定无限续期。
    const emailQuota = await peekThrottle(failureBucket, LOGIN_FAILURES_PER_EMAIL);
    if (!emailQuota.allowed) return tooManyRequests(emailQuota.retryAfterSeconds, "该账号的登录尝试");
    sweepThrottle();

    stage = "lookup";
    const [user] = await withDbDeadline("account.login.lookup", (db) => db.select().from(users).where(eq(users.email, email)).limit(1));
    stage = "password";
    const valid = await verifyPassword(password, {
      hash: user?.passwordHash || undefined,
      salt: user?.passwordSalt || undefined,
      iterations: user?.passwordIterations || undefined,
    });
    if (!user || !valid) {
      await consumeThrottle(failureBucket, LOGIN_FAILURES_PER_EMAIL);
      return invalidCredentials();
    }

    stage = "session-write";
    const session = await createSession(user.email);
    const response = Response.json({ user: { email: user.email, displayName: user.displayName || user.email } });
    response.headers.set("set-cookie", serializeSessionCookie(session.token, isSecureRequest(request)));
    return response;
  } catch (cause) {
    const message = describeErrorChain(cause);
    console.error("Account login failed", cause);
    // 超时错误的文案对不上下面那条正则（它匹配的是连接类字样），单独判一次，
    // 否则 deadline 触发时会掉进末尾的 500，客户端不会重试。
    if (isDatabaseUnavailable(cause) || /relation .* does not exist|postgres|database|DATABASE_URL|ECONN|ENOTFOUND|connect|SSL|TLS|password authentication failed/i.test(message)) {
      return Response.json({ error: "账号数据库暂时不可用，请稍后重试", code: `LOGIN_${stage.toUpperCase()}` }, { status: 503 });
    }
    if (stage === "password") {
      return Response.json({ error: "密码安全计算暂时不可用，请稍后重试", code: "LOGIN_PASSWORD" }, { status: 503 });
    }
    return Response.json({ error: `账号服务暂时不可用（LOGIN_${stage.toUpperCase()}）`, code: `LOGIN_${stage.toUpperCase()}` }, { status: 500 });
  }
}

function invalidCredentials() {
  return Response.json({ error: "邮箱或密码错误" }, { status: 401 });
}
