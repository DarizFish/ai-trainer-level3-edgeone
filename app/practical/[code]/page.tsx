import { notFound, redirect } from "next/navigation";
import { practicalByCode } from "@/lib/content";
import { getAccountUser } from "@/lib/account-auth";
import PracticalWorkspace from "@/components/PracticalWorkspace";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params; const task = practicalByCode.get(code); return { title: task ? `${task.code} ${task.title}` : "实操题" };
}

export default async function PracticalDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params; const task = practicalByCode.get(code); if (!task) notFound();
  if (task.hasNotebook) redirect(`/practical/${task.code}/lab`);
  const user = await getAccountUser();
  const wordTemplateTask = task.group === "4.1" || task.group === "4.2";
  const businessAnswerSheetTask = task.group === "1.2";
  return <main className={`practical-detail-page ${wordTemplateTask ? "word-template-detail-page" : ""} ${businessAnswerSheetTask ? "business-answer-sheet-page" : ""}`}><section className="container workspace practical-detail-workspace"><PracticalWorkspace task={task} userEmail={user?.email ?? null} /></section></main>;
}
