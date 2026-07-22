import { eq } from "drizzle-orm";
import { getDb } from "@/db";
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

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as { email?: unknown; password?: unknown } | null;
  const email = normalizeEmail(typeof payload?.email === "string" ? payload.email : "");
  const password = typeof payload?.password === "string" ? payload.password : "";
  if (!isValidEmail(email) || !password) return invalidCredentials();

  let stage: "schema" | "lookup" | "password" | "session-write" = "schema";
  try {
    await ensureAccountSchema();
    stage = "lookup";
    const [user] = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
    stage = "password";
    const valid = await verifyPassword(password, {
      hash: user?.passwordHash || undefined,
      salt: user?.passwordSalt || undefined,
      iterations: user?.passwordIterations || undefined,
    });
    if (!user || !valid) return invalidCredentials();

    stage = "session-write";
    const session = await createSession(user.email);
    const response = Response.json({ user: { email: user.email, displayName: user.displayName || user.email } });
    response.headers.set("set-cookie", serializeSessionCookie(session.token, isSecureRequest(request)));
    return response;
  } catch (cause) {
    const message = describeErrorChain(cause);
    console.error("Account login failed", cause);
    if (/relation .* does not exist|postgres|database|DATABASE_URL|ECONN|ENOTFOUND|connect|SSL|TLS|password authentication failed/i.test(message)) {
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
