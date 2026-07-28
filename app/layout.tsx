import type { Metadata } from "next";
import Link from "next/link";
import { AccountControls, AccountProvider } from "@/components/AccountSession";
import IntentLink from "@/components/IntentLink";
import SiteNavigationLinks from "@/components/SiteNavigationLinks";
import { practicalMockEnabled } from "@/lib/features";
import { SITE_ORIGIN } from "@/lib/site";
import "./globals.css";

const navigation = ([
  ["理论题库", "/theory"],
  ["模拟考试", "/theory/mock"],
  ["实操题库", "/practical"],
  ["实操组卷", "/practical/mock"],
  ["参考资料", "/resources"],
  ["学习档案", "/progress"],
] as const).filter(([, href]) => practicalMockEnabled || href !== "/practical/mock");

const title = "人工智能训练师三级全题库备考站（上海）";
const description = "900 道理论题、190 道标准模拟题、40 道实操题与 20 个在线 Python 实验。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: { default: title, template: `%s｜${title}` },
  description,
  openGraph: { title, description, type: "website", locale: "zh_CN", images: [{ url: "/og.jpg", width: 1672, height: 941, alt: title }] },
  twitter: { card: "summary_large_image", title, description, images: ["/og.jpg"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <AccountProvider>
          <header className="site-header">
            <div className="container nav-row">
              <IntentLink className="brand" href="/" aria-label="人工智能训练师三级备考站（上海）首页">
                <span className="brand-mark">AI</span>
                <span><b>人工智能训练师（上海）</b><small>三级全题库备考站</small></span>
              </IntentLink>
              <nav className="main-nav" aria-label="主导航">
                <SiteNavigationLinks items={navigation} />
              </nav>
              <div className="account-area desktop-account">
                <AccountControls />
              </div>
              <details className="mobile-menu">
                <summary><span aria-hidden="true">☰</span><span>菜单</span></summary>
                <div className="mobile-menu-panel">
                  <nav aria-label="手机主导航">
                    <SiteNavigationLinks items={navigation} showArrows />
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
              <div>
                <b>人工智能训练师三级备考站（上海）</b>
                <p>理论 · 实操 · 模拟 · 参考资料 · 学习档案一站完成</p>
                <p>本站为个人制作的备考辅助工具，与各认定机构无隶属或授权关系。</p>
                <div className="footer-legal">
                  <Link href="/disclaimer">免责声明</Link>
                  <Link href="/terms">服务条款</Link>
                  <Link href="/privacy">隐私政策</Link>
                </div>
              </div>
              <div><SiteNavigationLinks items={navigation} /></div>
            </div>
          </footer>
        </AccountProvider>
      </body>
    </html>
  );
}
