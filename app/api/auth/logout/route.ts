import { clearSessionCookie, deleteSession, isSecureRequest } from "@/lib/account-auth";

export async function POST(request: Request) {
  // 登出永远要成功：会话删不掉也照样清 Cookie 并跳回首页，否则数据库抖一下用户
  // 就退不出去了。服务端那行记录会在 30 天后随 expires_at 自然失效。
  await deleteSession(request.headers.get("cookie")).catch((cause) => {
    console.error("Session delete failed during logout", cause);
  });
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL("/", request.url).toString(),
      "set-cookie": clearSessionCookie(isSecureRequest(request)),
    },
  });
}
