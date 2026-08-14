import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: [
        // JupyterLite 整套运行时是几万个静态文件，`/labs/` 下还有数据集和 46MB 的
        // ONNX 模型分片。这些东西没有一个是搜索结果，放开只会把抓取预算烧在上面。
        "/lite/",
        "/labs/",
        // 实操 lab 本身不是内容页，可索引的是题目页 `/practical/<code>`。
        "/practical/*/lab",
        "/api/",
        // 登录表单和个人学习档案，登出状态下没有内容。
        "/account",
        "/progress",
      ],
    }],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}

// 注意：`/content/` 和 `/_next/` 必须保持放行。题库页的题目是客户端取
// `/content/theory-<version>.<hash>.json` 渲染的，挡掉这两个目录，爬虫渲染出来的就是空页。
