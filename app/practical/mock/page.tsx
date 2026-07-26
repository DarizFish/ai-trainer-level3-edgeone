import Link from "next/link";
import { redirect } from "next/navigation";
import { content } from "@/lib/content";
import PracticalMockLoader from "@/components/PracticalMockLoader";
import { examBlueprint } from "@/lib/exam-blueprint";
import { practicalMockEnabled } from "@/lib/features";

export const metadata = { title: "实操模拟组卷" };
export const dynamic = "force-static";

export default function PracticalMockPage() {
  if (!practicalMockEnabled) redirect("/practical");

  return <main className="mock-page">
    <link rel="preload" href={`/content/practical-${encodeURIComponent(content.version)}.json`} as="fetch" />
    <section className="container mock-page-head">
      <div><div className="breadcrumbs"><Link href="/">首页</Link>　/　<Link href="/practical">实操题库</Link>　/　实操组卷</div><h1>实操模拟考场</h1></div>
      <p><b>{examBlueprint.practical.durationMinutes}</b> 分钟 · {examBlueprint.practical.totalTasks} 题 · {examBlueprint.practical.maxScore} 分</p>
    </section>
    <PracticalMockLoader contentVersion={content.version} />
  </main>;
}
