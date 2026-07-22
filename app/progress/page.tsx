import Link from "next/link";
import { requireAccountUser } from "@/lib/account-auth";
import ProgressDashboard from "@/components/ProgressDashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "学习档案" };

export default async function ProgressPage() {
  const user = await requireAccountUser("/progress");
  return <main><section className="page-hero paper-texture"><div className="container"><div className="breadcrumbs"><Link href="/">首页</Link>　/　学习档案</div><p className="eyebrow">多设备同步</p><h1>{user.displayName} 的学习档案</h1><p>理论作答、错题、收藏、实操评分与代码草稿都保存在你的账号下。</p></div></section><section className="container workspace"><ProgressDashboard /></section></main>;
}
