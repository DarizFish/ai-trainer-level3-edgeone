import Link from "next/link";
import { content, theoryById } from "@/lib/content";
import { getAccountUser } from "@/lib/account-auth";
import TheoryPractice from "@/components/TheoryPractice";

export const metadata = { title: "理论题库" };

export default async function TheoryPage({ searchParams }: { searchParams: Promise<{ question?: string }> }) {
  const user = await getAccountUser();
  const query = await searchParams;
  const initialQuestionId = query.question && theoryById.has(query.question) ? query.question : undefined;
  return <main className="theory-page">
    <section className="container theory-page-head">
      <div><div className="breadcrumbs"><Link href="/">首页</Link>　/　理论题库</div><h1>理论刷题</h1></div>
      <p><b>900</b> 道题 · 按目标选题，答案提交后显示</p>
    </section>
    <section className="container theory-workspace"><TheoryPractice questions={content.theory} signedIn={Boolean(user)} contentVersion={content.version} initialQuestionId={initialQuestionId} /></section>
  </main>;
}
