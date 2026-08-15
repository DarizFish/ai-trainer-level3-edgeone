import { clearSessionCookie, deleteSession, isSecureRequest } from "@/lib/account-auth";

export async function POST(request: Request) {
  // 登出永远要成功：会话删不掉也照样清 Cookie 并跳回首页，否则数据库抖一下用户
  // 就退不出去了。服务端那行记录会在 30 天后随 expires_at 自然失效。
  await deleteSession(request.headers.get("cookie")).catch((cause) => {
    console.error("Session delete failed during logout", cause);
  });
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
