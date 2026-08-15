import Link from "next/link";
import { BACKUP_SITE_ORIGIN, SITE_ORIGIN } from "@/lib/site";

export const metadata = {
  title: "访问与备用网址",
  description: "人工智能训练师三级备考站的正式地址、备用网址状态和跨域数据说明。",
};

export default function AccessPage() {
  return (
    <main className="container workspace access-page">
      <header className="resources-page-head">
        <div className="breadcrumbs"><Link href="/">首页</Link>　/　访问与备用网址</div>
        <p className="eyebrow">官方地址核验</p>
        <h1>认准本站地址，<br />不要使用陌生镜像。</h1>
        <p>备用网址只有通过备案、HTTPS、版本一致性和完整业务验收后才会在这里公开。本站不会提供裸 IP 或短链接。</p>
      </header>

      <section className="access-addresses" aria-label="站点地址">
        <article>
          <span>正式地址</span><strong>{SITE_ORIGIN}</strong><p>当前对外正式站。建议收藏这一页，以便随时核对站点地址。</p><a href={SITE_ORIGIN}>打开正式站</a>
        </article>
        <article className={BACKUP_SITE_ORIGIN ? "ready" : "pending"}>
          <span>备用网址</span><strong>{BACKUP_SITE_ORIGIN ?? "尚未对外启用"}</strong><p>{BACKUP_SITE_ORIGIN ? "备用部署已经完成对外验收。" : "阿里云副本仍作为验收环境；未提供备用域名之前不会展示服务器 IP。"}</p>{BACKUP_SITE_ORIGIN && <a href={BACKUP_SITE_ORIGIN}>打开备用网址</a>}
        </article>
      </section>

      <section className="access-boundaries" aria-labelledby="access-boundary-title">
        <p className="eyebrow">切换前必读</p><h2 id="access-boundary-title">换域名不等于无缝续考。</h2>
        <div>
          <article><b>需要重新登录</b><p>不同域名不会共享登录 Cookie；使用同一账号重新登录后，云端学习记录才会恢复。</p></article>
          <article><b>进行中考试不迁移</b><p>理论和实操模拟的进行中状态保存在当前域名的浏览器存储中，不能自动带到备用域名。</p></article>
          <article><b>先导出实验成果</b><p>JupyterLite 浏览器文件系统按域名隔离；切换前先导出重要 Notebook 和结果文件。</p></article>
        </div>
      </section>

      <aside className="access-safety"><b>防钓鱼提示</b><p>只认本页列出的 HTTPS 地址。本站不会私信发送“新域名”，也不会以恢复账号或报名为由索要密码、验证码、身份证或转账。</p></aside>
    </main>
  );
}
