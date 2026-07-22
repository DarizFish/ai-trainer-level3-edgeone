import Link from "next/link";

export default function NotFound() { return <main className="container workspace"><div className="empty-state"><p className="eyebrow">404</p><h1>没有找到这道题</h1><p>题号可能有误，或内容版本已经更新。</p><Link className="button button-primary" href="/">返回首页</Link></div></main>; }
