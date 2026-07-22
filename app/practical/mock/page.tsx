import Link from "next/link";
import { content, getOfficialPracticalMock } from "@/lib/content";
import { getAccountUser } from "@/lib/account-auth";
import PracticalMock from "@/components/PracticalMock";
import { examBlueprint } from "@/lib/exam-blueprint";

export const metadata = { title: "实操模拟组卷" };

export default async function PracticalMockPage() {
  const user = await getAccountUser();
  return <main className="mock-page">
    <section className="container mock-page-head">
      <div><div className="breadcrumbs"><Link href="/">首页</Link>　/　<Link href="/practical">实操题库</Link>　/　实操组卷</div><h1>实操模拟考场</h1></div>
      <p><b>{examBlueprint.practical.durationMinutes}</b> 分钟 · {examBlueprint.practical.totalTasks} 题 · {examBlueprint.practical.maxScore} 分</p>
    </section>
    <PracticalMock allTasks={content.practical} officialTasks={getOfficialPracticalMock()} contentVersion={content.version} signedIn={Boolean(user)} />
  </main>;
}
