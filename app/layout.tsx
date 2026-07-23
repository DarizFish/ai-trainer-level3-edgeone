import type { Metadata } from "next";
import Link from "next/link";
import { AccountControls, AccountProvider } from "@/components/AccountSession";
import { content } from "@/lib/content";
import "./globals.css";

const navigation = [
  ["理论题库", "/theory"],
  ["模拟考试", "/theory/mock"],
  ["实操题库", "/practical"],
  ["实操组卷", "/practical/mock"],
  ["认定方案", "/blueprint"],
  ["学习档案", "/progress"],
] as const;

const title = "人工智能训练师三级全题库备考站";
const description = "900 道理论题、190 道官方模拟题、40 道实操题与 20 个在线 Python 实验。";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.aitrainer3.xyz"),
  title: { default: title, template: `%s｜${title}` },
  description,
  openGraph: { title, description, type: "website", locale: "zh_CN", images: [{ url: "/og.png", width: 1664, height: 936, alt: title }] },
  twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <AccountProvider>
          <link rel="prefetch" href={`/api/content/theory?v=${encodeURIComponent(content.version)}`} as="fetch" />
          <link rel="prefetch" href={`/api/content/practical?v=${encodeURIComponent(content.version)}`} as="fetch" />
          <header className="site-header">
            <div className="container nav-row">
              <Link className="brand" href="/" aria-label="人工智能训练师三级备考站首页">
                <span className="brand-mark">AI</span>
                <span><b>人工智能训练师</b><small>三级全题库备考站</small></span>
              </Link>
              <nav className="main-nav" aria-label="主导航">
                {navigation.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
              </nav>
              <div className="account-area desktop-account">
                <AccountControls />
              </div>
              <details className="mobile-menu">
                <summary><span aria-hidden="true">☰</span><span>菜单</span></summary>
                <div className="mobile-menu-panel">
                  <nav aria-label="手机主导航">
                    {navigation.map(([label, href]) => <Link href={href} key={href}>{label}<span aria-hidden="true">→</span></Link>)}
                  </nav>
                  <div className="mobile-account">
                    <AccountControls mobile />
                  </div>
                </div>
              </details>
            </div>
          </header>
          {children}
          <footer className="site-footer">
            <div className="container footer-row">
              <div><b>人工智能训练师三级备考站</b><p>依据评价指导手册整理 · 每道答案标明具体来源</p></div>
              <div>{navigation.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}</div>
            </div>
          </footer>
        </AccountProvider>
      </body>
    </html>
  );
}
