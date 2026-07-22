import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { accountSignInPath, getAccountUser } from "@/lib/account-auth";
import "./globals.css";

const navigation = [
  ["理论题库", "/theory"],
  ["模拟考试", "/theory/mock"],
  ["实操题库", "/practical"],
  ["实操组卷", "/practical/mock"],
  ["认定方案", "/blueprint"],
  ["学习档案", "/progress"],
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "人工智能训练师三级全题库备考站";
  const description = "900 道理论题、190 道官方模拟题、40 道实操题与 20 个在线 Python 实验。";
  return {
    metadataBase: new URL(origin),
    title: { default: title, template: `%s｜${title}` },
    description,
    openGraph: { title, description, type: "website", locale: "zh_CN", images: [{ url: `${origin}/og.png`, width: 1664, height: 936, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [`${origin}/og.png`] },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getAccountUser();
  const signInPath = accountSignInPath("/progress");

  return (
    <html lang="zh-CN">
      <body>
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
              {user ? <>
                <span className="account-name" title={user.email}>{user.displayName}</span>
                <form className="account-logout" action="/api/auth/logout" method="post"><button className="account-link" type="submit">退出</button></form>
              </> : <Link className="button button-small" href={signInPath}>登录 / 注册</Link>}
            </div>
            <details className="mobile-menu">
              <summary><span aria-hidden="true">☰</span><span>菜单</span></summary>
              <div className="mobile-menu-panel">
                <nav aria-label="手机主导航">
                  {navigation.map(([label, href]) => <Link href={href} key={href}>{label}<span aria-hidden="true">→</span></Link>)}
                </nav>
                <div className="mobile-account">
                  {user ? <>
                    <div><b>{user.displayName}</b><small>{user.email}</small></div>
                    <form className="account-logout" action="/api/auth/logout" method="post"><button className="button button-quiet" type="submit">退出账号</button></form>
                  </> : <Link className="button button-primary" href={signInPath}>登录 / 注册</Link>}
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
      </body>
    </html>
  );
}
