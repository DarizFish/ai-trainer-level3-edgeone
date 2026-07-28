import Link from "next/link";
import { LEGAL_UPDATED, SITE_CONTACT_EMAIL } from "@/lib/site";

/** 隐私政策、服务条款、免责声明共用的版式：面包屑 + 标题 + 修订日期 + 正文 + 联系方式。 */
export default function LegalPage({ eyebrow, title, summary, children }: {
  eyebrow: string;
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <main className="container workspace legal-page">
      <header className="legal-page-head">
        <div className="breadcrumbs"><Link href="/">首页</Link>　/　{title}</div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="legal-summary">{summary}</p>
        <p className="legal-updated">最后更新：{LEGAL_UPDATED}</p>
      </header>
      <article className="legal-body">{children}</article>
      <footer className="legal-contact">
        <b>联系我们</b>
        <p>对本页内容有疑问，或需要行使下述任何权利，请发送邮件至 <a href={`mailto:${SITE_CONTACT_EMAIL}`}>{SITE_CONTACT_EMAIL}</a>。</p>
      </footer>
    </main>
  );
}
