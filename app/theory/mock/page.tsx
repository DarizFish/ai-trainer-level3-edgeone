import Link from "next/link";
import { content, getOfficialTheoryMock } from "@/lib/content";
import { getAccountUser } from "@/lib/account-auth";
import TheoryMock from "@/components/TheoryMock";
import { examBlueprint } from "@/lib/exam-blueprint";

export const metadata = { title: "理论模拟考试" };

export default async function TheoryMockPage() {
  const user = await getAccountUser();
  return <main className="mock-page">
    <section className="container mock-page-head">
      <div><div className="breadcrumbs"><Link href="/">首页</Link>　/　<Link href="/theory">理论题库</Link>　/　模拟考试</div><h1>理论模拟考场</h1></div>
      <p><b>{examBlueprint.theory.durationMinutes}</b> 分钟 · {examBlueprint.theory.totalQuestions} 题 · {examBlueprint.theory.maxScore} 分</p>
    </section>
    <TheoryMock allQuestions={content.theory} officialQuestions={getOfficialTheoryMock()} signedIn={Boolean(user)} contentVersion={content.version} />
  </main>;
}
