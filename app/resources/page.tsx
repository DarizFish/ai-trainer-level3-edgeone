import Link from "next/link";

export const metadata = {
  title: "官方参考资料与报名入口",
  description: "人工智能训练师国家职业标准、备案评价机构、报名咨询、官方课程与证书查询入口。",
};

const preparationResources = [
  {
    label: "国家职业标准",
    title: "人工智能训练师国家职业技能标准（2021 年版）",
    description: "人力资源和社会保障部、工业和信息化部制定。备考时可重点查看职业功能、工作内容、技能要求与相关知识要求。",
    href: "https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/rcrs_4225/jnrc/202112/W020211227626977039770.pdf",
    domain: "mohrss.gov.cn",
    action: "打开官方 PDF",
  },
  {
    label: "标准查询",
    title: "国家职业标准查询系统",
    description: "可按“人工智能训练师”或职业编码 4-04-05-05 查询标准信息，用于确认职业名称和现行标准。",
    href: "https://www.osta.org.cn/skillStandard",
    domain: "osta.org.cn",
    action: "查询职业标准",
  },
  {
    label: "政策通知",
    title: "技能人才评价工作网",
    description: "查看技能人才评价政策、通知和职业标准更新。具体认定安排仍以所在地备案评价机构当期公告为准。",
    href: "https://www.osta.org.cn/",
    domain: "osta.org.cn",
    action: "查看政策通知",
  },
  {
    label: "在线课程",
    title: "就业创业和职业培训在线服务平台",
    description: "进入课程中心后搜索“人工智能训练师”。课程会动态调整或下架，请以平台当前展示的等级和开放状态为准。",
    href: "https://xzy.mohrss.gov.cn/lesson",
    domain: "xzy.mohrss.gov.cn",
    action: "搜索官方课程",
  },
] as const;

const serviceLinks = [
  {
    label: "报名前必查",
    title: "职业技能等级评价机构公示查询",
    description: "按省份、职业名称、等级和机构类型筛选已备案评价机构，再从机构详情核对认定范围与联系方式。",
    href: "https://pjjg.osta.org.cn/",
    domain: "pjjg.osta.org.cn",
    action: "查询备案机构",
  },
  {
    label: "考后查询",
    title: "技能人才评价证书全国联网查询",
    description: "取得职业技能等级证书后，可通过全国联网系统查询证书信息。请认准官方域名。",
    href: "https://jndj.osta.org.cn/",
    domain: "jndj.osta.org.cn",
    action: "查询证书",
  },
] as const;

type Resource = (typeof preparationResources)[number] | (typeof serviceLinks)[number];

function OfficialResourceCard({ resource }: { resource: Resource }) {
  return (
    <article className="official-resource-card">
      <div className="official-resource-head">
        <span>{resource.label}</span>
        <small>官方入口</small>
      </div>
      <h3>{resource.title}</h3>
      <p>{resource.description}</p>
      <a
        className="official-resource-link"
        href={resource.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${resource.action}（在新窗口打开）`}
      >
        <span><small>官方域名</small><b>{resource.domain}</b></span>
        <strong>{resource.action}<span aria-hidden="true"> ↗</span></strong>
      </a>
    </article>
  );
}

export default function ResourcesPage() {
  return (
    <main>
      <section className="page-hero paper-texture resources-hero">
        <div className="container">
          <div className="breadcrumbs"><Link href="/">首页</Link>　/　参考资料</div>
          <p className="eyebrow">只收录政府部门与技能人才评价官方平台</p>
          <h1>官方参考资料与报名入口</h1>
          <p>从国家职业标准开始备考，通过备案机构查询系统寻找本地报名渠道，考试后再到全国联网系统查询证书。</p>
          <div className="resource-verification">
            <span>6 个官方入口</span>
            <span>链接核验日期：2026-07-24</span>
            <span>本站不收集报名资料</span>
          </div>
        </div>
      </section>

      <div className="container workspace resources-page">
        <section className="resources-section" aria-labelledby="preparation-heading">
          <div className="resources-heading">
            <div>
              <p className="eyebrow">备考依据</p>
              <h2 id="preparation-heading">先看标准，再补知识</h2>
            </div>
            <p>标准 PDF 是确认考试能力范围的主要依据；政策通知和课程中心用于补充了解，页面内容可能随官方更新。</p>
          </div>
          <div className="official-resource-grid">
            {preparationResources.map((resource) => <OfficialResourceCard resource={resource} key={resource.href} />)}
          </div>
        </section>

        <section className="registration-guide" aria-labelledby="registration-heading">
          <div className="registration-guide-copy">
            <p className="eyebrow">报名怎么走</p>
            <h2 id="registration-heading">全国没有统一报名按钮</h2>
            <p>职业技能等级认定通常由各地已备案的评价机构组织。报名时间、材料、费用和考点存在地区差异，应以机构当期公告为准。</p>
            <a
              className="button button-primary"
              href="https://pjjg.osta.org.cn/"
              target="_blank"
              rel="noopener noreferrer"
            >
              打开备案机构查询系统 <span aria-hidden="true">↗</span>
            </a>
          </div>
          <ol className="registration-steps">
            <li><span>1</span><div><b>填写职业名称</b><p>输入“人工智能训练师”，不要只搜索含糊的“AI 培训”。</p></div></li>
            <li><span>2</span><div><b>选择省份和等级</b><p>选择你计划参加认定的省份，并将等级筛选为三级。</p></div></li>
            <li><span>3</span><div><b>核对认定范围</b><p>打开机构详情，确认其备案范围确实包含该职业和等级。</p></div></li>
            <li><span>4</span><div><b>联系机构报名</b><p>按官方展示的联系方式咨询当期批次、材料、费用与考点。</p></div></li>
          </ol>
        </section>

        <section className="resources-section" aria-labelledby="services-heading">
          <div className="resources-heading">
            <div>
              <p className="eyebrow">办事入口</p>
              <h2 id="services-heading">报名核验与证书查询</h2>
            </div>
            <p>报名前先查机构备案，考后通过全国联网系统核验证书，两个入口分别服务于认定前后。</p>
          </div>
          <div className="official-resource-grid service-resource-grid">
            {serviceLinks.map((resource) => <OfficialResourceCard resource={resource} key={resource.href} />)}
          </div>
        </section>

        <aside className="resource-safety" aria-labelledby="safety-heading">
          <div>
            <p className="eyebrow">防骗提示</p>
            <h2 id="safety-heading">只认备案信息，不认口头承诺</h2>
          </div>
          <p>警惕“包过”“免考拿证”“全国统一代报名”等宣传。本站不代办报名、不收集身份证件、不推荐收费机构；机构资质、认定范围和联系方式均应回到官方公示系统核对。</p>
        </aside>
      </div>
    </main>
  );
}
