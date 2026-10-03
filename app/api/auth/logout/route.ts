import { clearSessionCookie, deleteSession, isSecureRequest } from "@/lib/account-auth";

export async function POST(request: Request) {
  const wantsJson = request.headers.get("accept")?.includes("application/json");
  let failed = false;
  // 浏览器表单即使撤销失败也清 Cookie 并跳回首页。小程序要求确认服务端撤销，
  // JSON 分支因此保留失败状态，让客户端显示错误并允许重试。
  await deleteSession(request.headers.get("cookie")).catch((cause) => {
    failed = true;
    console.error("Session delete failed during logout", cause);
  });
  if (wantsJson) {
    if (failed) return Response.json({ error: "退出暂时失败，请稍后重试" }, { status: 503 });
    return Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookie(isSecureRequest(request)), "Cache-Control": "no-store" } });
  }
  // 相对 Location（RFC 7231 允许），不要用 `new URL("/", request.url)`：Next 16 的
  // request.url 取的是服务器自己的监听地址而不是 Host 头，反代后面会算出
  // `http://localhost:3000/`，用户一退出就被甩到本机地址上。相对写法由浏览器按当前
  // 地址补全，同时也不再需要正确配置 Host / X-Forwarded-Proto 才能保住 https。
  return new Response(null, {
    status: 303,
    headers: {
      location: "/",
      "set-cookie": clearSessionCookie(isSecureRequest(request)),
    },
  });
}
