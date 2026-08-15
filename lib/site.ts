/** 站点正式域名。metadata、robots.txt、sitemap.xml 三处都要用，集中一份避免改域名时漏掉。 */
export const SITE_ORIGIN = "https://www.aitrainer3.xyz";

/** 工信部备案信息。备案号由站点负责人提供，页脚必须逐字展示并链接到备案查询站。 */
export const ICP_RECORD = "沪ICP备2026039336号-1";
export const ICP_QUERY_URL = "https://beian.miit.gov.cn/";

/**
 * 备用网址只有完成备案、HTTPS 与完整业务验收后才能填写。
 * 未启用时保持 null，页面会诚实展示“尚未对外启用”，绝不回退到裸 IP。
 */
export const BACKUP_SITE_ORIGIN: string | null = null;

/**
 * 对外联系邮箱。隐私政策里承诺了「发邮件可以导出或删除账号」，服务条款里承诺了
 * 「侵权可以联系处理」——上线前这个信箱必须真的收得到信，否则两处承诺都是空的。
 */
export const SITE_CONTACT_EMAIL = "contact@aitrainer3.xyz";

/** 三份法务文本的最后修订日期，改动条款时一并更新。 */
export const LEGAL_UPDATED = "2026-08-14";
