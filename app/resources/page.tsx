import Link from "next/link";

export const metadata = {
  title: "人工智能训练师三级个人报名攻略",
  description: "上海人工智能训练师三级个人报名六步路径：确认报考项目、自查申报条件、选择报名机构、提交材料、审核缴费与开始备考。",
};

const professionCatalogUrl = "https://rsj.sh.gov.cn/cmsres/85/850e2df64f014cb5890b56b2b6f90eb7/45a59916012299e32e92268f29e09e07.pdf";
const shanghaiSkillUrl = "https://gjzs.sjtu.edu.cn/skill";
const associationMaterialUrl = "http://www.sh-aia.com/dynamics/detail538.htm";

const channels = [
  { name: "上海交通大学", detail: "查看职业技能等级认定页面，寻找人工智能训练师相关报名安排。", href: shanghaiSkillUrl },
  { name: "上海市计算技术研究所有限公司", detail: "通过机构公开联系方式，咨询人工智能训练师三级个人报名。" },
  { name: "上海市人工智能行业协会", detail: "查看人工智能训练师相关报名通知与材料入口。", href: associationMaterialUrl },
] as const;

export default function ResourcesPage() {
  return (
    <main className="container workspace resources-page registration-guide">
      <header className="resources-page-head">
        <div className="breadcrumbs"><Link href="/">首页</Link>　/　报名攻略</div>
        <p className="eyebrow">上海 · 个人报名</p>
        <h1>第一次报名？<br />照着这六步走。</h1>
        <p>先确认自己符合哪类申报条件，再选择报名机构提交材料。审核、缴费和报名确认完成后，就可以进入理论与实操备考。</p>
      </header>

      <ol className="registration-steps" aria-label="个人报名六步路径">
        <li>
          <span>01</span>
          <div><small>确认项目</small><h2>确认报考地区、职业和等级</h2><p>选择上海地区的“人工智能训练师（三级）”。如果你准备报考其他地区或等级，需要查询当地对应项目。</p></div>
          <strong>确认结果：上海／人工智能训练师／三级</strong>
        </li>
        <li>
          <span>02</span>
          <div><small>自查条件</small><h2>找到适合自己的申报条件</h2><p>先在上海专业目录中查询自己的专业。专业不在目录中时，可以向报名机构咨询是否可按工作经历、社保等条件申报，以及需要准备哪些证明。</p><a className="text-link" href={professionCatalogUrl} target="_blank" rel="noopener noreferrer">查询上海专业目录<span aria-hidden="true"> ↗</span></a></div>
          <strong>准备结果：明确申报条件和对应证明材料</strong>
        </li>
        <li>
          <span>03</span>
          <div><small>选择机构</small><h2>选择一家机构咨询报名</h2><p>咨询时直接问清三个问题：是否受理个人报名、需要哪些材料、从哪里提交。确认可以报名后，再按这家机构的流程继续办理。</p><a className="text-link" href="#registration-channels">查看报名渠道<span aria-hidden="true"> ↓</span></a></div>
          <strong>选择结果：确定一家可以受理个人报名的机构</strong>
        </li>
        <li>
          <span>04</span>
          <div><small>提交材料</small><h2>按清单整理材料并送审</h2><p>根据机构给出的清单准备身份证明、学历或专业证明，以及工作经历、社保等申报条件所需材料。提交后留意审核结果，需要补充时及时补交。</p></div>
          <strong>提交结果：材料已送审，并知道是否需要补充</strong>
        </li>
        <li>
          <span>05</span>
          <div><small>审核缴费</small><h2>审核通过后完成缴费</h2><p>收到审核通过通知后，按报名机构提供的方式缴费，并保存支付凭证和报名成功确认。</p></div>
          <strong>完成结果：缴费凭证和报名确认已经保存</strong>
        </li>
        <li>
          <span>06</span>
          <div><small>开始备考</small><h2>保存考试资料，安排理论与实操练习</h2><p>保存指导资料、准考和考试安排。先熟悉理论题型和计分规则，再进入实操题库完成 Word、数据处理与 Python 实验。</p></div>
          <strong>开始备考：考试资料、时间安排和练习计划都已就位</strong>
        </li>
      </ol>

      <section id="registration-channels" className="guide-channels" aria-labelledby="guide-channel-title">
        <header><p className="eyebrow">报名渠道</p><h2 id="guide-channel-title">选择一家，开始咨询报名</h2><p>咨询时可以直接说明你要报考“上海地区人工智能训练师三级”，并询问个人报名、材料清单和提交方式。</p></header>
        <div>
          {channels.map((channel) => (
            <article key={channel.name}>
              <span aria-hidden="true">✓</span><h3>{channel.name}</h3><p>{channel.detail}</p>
              {"href" in channel && channel.href && <a href={channel.href} target="_blank" rel="noopener noreferrer">查看报名页面<span aria-hidden="true"> ↗</span></a>}
            </article>
          ))}
        </div>
      </section>

      <section className="guide-ready" aria-labelledby="guide-ready-title">
        <div><p className="eyebrow">报名完成后</p><h2 id="guide-ready-title">从理论和实操两条线开始准备</h2><p>理论题库用于熟悉知识点和考试节奏；实操题库可以直接作答、运行 Python，并按答案逐项复盘。</p></div>
        <div className="guide-ready-actions"><Link className="button button-primary" href="/theory">开始理论练习</Link><Link className="button button-quiet" href="/practical">进入实操题库</Link></div>
      </section>
    </main>
  );
}
