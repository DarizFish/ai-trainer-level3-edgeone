import Link from "next/link";
import { content } from "@/lib/content";
import { contentAssets } from "@/lib/content-assets";
import TheoryPracticeLoader from "@/components/TheoryPracticeLoader";

export const metadata = { title: "理论题库" };
export const dynamic = "force-static";

export default function TheoryPage() {
  return <main className="theory-page">
    <link rel="preload" href={contentAssets.theory} as="fetch" />
    <section className="container theory-page-head">
      <div><div className="breadcrumbs"><Link href="/">首页</Link>　/　理论题库</div><h1>理论刷题</h1></div>
      <p><b>900</b> 道题 · 按目标选题，答案提交后显示</p>
    </section>
    <section className="container theory-workspace"><TheoryPracticeLoader contentVersion={content.version} /></section>
  </main>;
}
