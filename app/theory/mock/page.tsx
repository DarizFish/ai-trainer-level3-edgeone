import Link from "next/link";
import { content } from "@/lib/content";
import { contentAssets } from "@/lib/content-assets";
import TheoryMockLoader from "@/components/TheoryMockLoader";
import { examBlueprint } from "@/lib/exam-blueprint";

export const metadata = { title: "理论模拟考试" };
export const dynamic = "force-static";

export default function TheoryMockPage() {
  return <main className="mock-page">
    <link rel="preload" href={contentAssets.theory} as="fetch" />
    <section className="container mock-page-head">
      <div><div className="breadcrumbs"><Link href="/">首页</Link>　/　<Link href="/theory">理论题库</Link>　/　模拟考试</div><h1>理论模拟考场</h1></div>
      <p><b>{examBlueprint.theory.durationMinutes}</b> 分钟 · {examBlueprint.theory.totalQuestions} 题 · {examBlueprint.theory.maxScore} 分</p>
    </section>
    <TheoryMockLoader contentVersion={content.version} />
  </main>;
}
