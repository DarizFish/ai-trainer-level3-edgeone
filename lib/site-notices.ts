export type SiteNotice = {
  id: string;
  label: string;
  title: string;
  summary: string;
  href: string;
  actionLabel: string;
};

/**
 * 首页同一时间只展示一条行动型公告。报名日期、费用和联系方式不在这里复制，
 * 用户沿 CTA 进入稳定攻略后，再到对应发布方核验当期信息。
 */
export const homeNotice: SiteNotice = {
  id: "registration-guide-2026-08",
  label: "报名攻略已上线",
  title: "报名前，先核对资格路径与正规渠道",
  summary: "六步走完资格自查、渠道审核、缴费确认和资料准备，再开始备考。",
  href: "/resources",
  actionLabel: "查看报名攻略",
};
