// JupyterLite 的 ServiceWorkerManager 每 20 秒轮询一次心跳，用来确认 service
// worker 还活着。它把路径硬编码为站点根下的 /api/service-worker-heartbeat，
// 而本站把 JupyterLite 挂在 /lite/ 子路径下，service worker 的作用域是
// /lite/，永远拦不到这个请求，于是心跳只能命中 Next.js 并返回 404 HTML，
// 存活轮询在第一次就终止。这里补一个纯文本 ok，让轮询按预期继续。
export const dynamic = "force-static";

export function GET() {
  return new Response("ok", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
