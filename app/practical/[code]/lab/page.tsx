import { notFound } from "next/navigation";
import { practicalByCode } from "@/lib/content";
import { getAccountUser } from "@/lib/account-auth";
import PracticalLabWorkbench from "@/components/PracticalLabWorkbench";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const task = practicalByCode.get(code);
  return { title: task ? `${task.code} JupyterLite 实验室` : "JupyterLite 实验室" };
}

export default async function LabPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const task = practicalByCode.get(code);
  if (!task?.hasNotebook) notFound();
  const user = await getAccountUser();

  return <main className="lab-page">
    <PracticalLabWorkbench task={task} signedIn={Boolean(user)} userEmail={user?.email ?? null} />
  </main>;
}
