export type SiteNotice = {
  id: string;
  label: string;
  title: string;
  summary: string;
  href: string;
  actionLabel: string;
};

/**
 * 全站同一时间只维护一条公告。更新 id 后，同一浏览器可以再次触达。
 */
export const siteNotice: SiteNotice = {
  id: "miniprogram-launch-2026-10",
  label: "新上线",
  title: "微信小程序上线了",
  summary: "手机刷题、模考与实操填空，随时接着练。",
  href: "/miniprogram",
  actionLabel: "查看小程序",
};
