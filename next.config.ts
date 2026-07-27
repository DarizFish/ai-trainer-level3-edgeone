import type { NextConfig } from "next";

// JupyterLite 的 Pyodide 内核只有在 mountDrive 为真时才会把 Python 的文件系统
// 挂到 Jupyter Contents 上，否则 to_csv 之类写出的文件只存在于内存中，学员在
// 文件浏览器里看不到。判定条件是 serviceWorkerManager.enabled || crossOriginIsolated。
// 前者对应的扩展已在 jupyterlite/jupyter-lite.json 里禁用，所以 mountDrive 只能
// 靠 crossOriginIsolated，而它只要发出 COOP/COEP 两个响应头即可稳定成立。
const crossOriginIsolation = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
];

// require-corp 对普通子资源只查 CORP，同源自动豁免；但对会开新执行上下文的资源
// （worker、iframe）查的是策略继承，同源不豁免，该响应必须自己带 COEP。Pyodide
// 内核正是 new Worker(<lite/extensions 下的分片>) 起来的，缺这个头会被 Chrome 以
// coep-frame-resource-needs-coep-header 拦掉，内核永远停在启动中。
const embedderPolicy = [{ key: "Cross-Origin-Embedder-Policy", value: "require-corp" }];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      // COOP/COEP 是文档级策略：外层页面必须自身跨域隔离，内嵌的 JupyterLite
      // 文档也要带 COEP 才能继承该状态。
      { source: "/practical/:code/lab", headers: crossOriginIsolation },
      { source: "/lite/lab/index.html", headers: crossOriginIsolation },
      // 联邦扩展分片会被 new Worker() 载入，必须自己带 COEP，详见上方注释。
      { source: "/lite/extensions/:path*", headers: embedderPolicy },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/content/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "CDN-Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Eo-Cdn-Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
