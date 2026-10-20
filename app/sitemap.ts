import type { MetadataRoute } from "next";
import { content } from "@/lib/content";
import { practicalMockEnabled, voluntarySupportEnabled } from "@/lib/features";
import { SITE_ORIGIN } from "@/lib/site";

export const dynamic = "force-static";

/** 内容版本形如 `2026-07-26-v8`，前 10 位就是这批题库的定稿日期。 */
function contentDate(): Date {
  const stamp = /^\d{4}-\d{2}-\d{2}/.exec(content.version)?.[0];
  const parsed = stamp ? new Date(`${stamp}T00:00:00Z`) : new Date(Number.NaN);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = contentDate();
  const hubs: Array<[string, number]> = [
    ["/", 1],
    ["/theory", 0.9],
    ["/practical", 0.9],
    ["/theory/mock", 0.8],
    // 实操组卷在开关关闭时会 302 回 `/practical`，重定向的地址不该出现在 sitemap 里。
    ...(practicalMockEnabled ? [["/practical/mock", 0.8] as [string, number]] : []),
    ["/resources", 0.5],
    ["/miniprogram", 0.5],
    ["/access", 0.4],
    // 赞赏关闭时 `/support` 同样会 302 回首页，同理不进 sitemap。
    ...(voluntarySupportEnabled ? [["/support", 0.3] as [string, number]] : []),
    ["/disclaimer", 0.3],
    ["/terms", 0.3],
    ["/privacy", 0.3],
  ];

  return [
    ...hubs.map(([path, priority]) => ({ url: `${SITE_ORIGIN}${path}`, lastModified, priority })),
    // 40 道实操题各有一个静态题目页。理论题没有独立路由，只在题库页里客户端渲染。
    ...content.practical.map((task) => ({
      url: `${SITE_ORIGIN}/practical/${encodeURIComponent(task.code)}`,
      lastModified,
      priority: 0.7,
    })),
  ];
}

// 不收录：`/account` 与 `/progress` 需要登录，登出状态下没有内容；`/practical/<code>/lab`
// 是作答界面而非内容页，两者都已在 robots.ts 里 Disallow。
