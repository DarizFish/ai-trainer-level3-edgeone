import Link from "next/link";

export const metadata = {
  title: "上海认定参考资料",
  description: "上海交通大学职业技能等级认定信息入口。",
};

const shanghaiSkillUrl = "https://gjzs.sjtu.edu.cn/skill";

export default function ResourcesPage() {
  return (
    <main className="container workspace resources-page">
      <header className="resources-page-head">
        <div className="breadcrumbs"><Link href="/">首页</Link>　/　参考资料</div>
        <p className="eyebrow">上海地区</p>
        <h1>参考资料</h1>
        <p>仅保留职业技能等级认定官方入口，具体通知和安排以官方页面为准。</p>
      </header>
      <article className="official-resource-card">
        <div className="official-resource-head">
          <span>上海认定信息</span>
          <small>官方入口</small>
        </div>
        <h2>上海交通大学职业技能等级认定</h2>
        <a
          className="official-resource-link"
          href={shanghaiSkillUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="打开上海交通大学职业技能等级认定页面（在新窗口打开）"
        >
          <span><small>官方域名</small><b>gjzs.sjtu.edu.cn</b></span>
          <strong>打开认定页面<span aria-hidden="true"> ↗</span></strong>
        </a>
      </article>
    </main>
  );
}
