import Link from "next/link";
import { content } from "@/lib/content";
import { HomeAccountCta } from "@/components/AccountSession";

export default function HomePage() {
  const stats = content.stats;
  const referenceAnswers = content.theory.filter((question) => question.answerBasis === "third_party_reference").length;
  const reviewedAnswers = content.theory.filter((question) => question.answerBasis === "editorial_review").length;
  const heuristicAnswers = content.theory.filter((question) => question.answerBasis === "heuristic").length;

  return (
    <main>
      <section className="hero paper-texture">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">国家职业技能等级 · 三级</p>
            <h1>把厚厚的指导手册，<br /><em>练成你的分数。</em></h1>
            <p className="lede">一站覆盖理论全题库、官方模拟卷、实操评分细则与 20 个浏览器 Python 实验。答案来源逐题标注，复习更有把握。</p>
            <HomeAccountCta />
          </div>
          <aside className="exam-docket" aria-label="题库概览">
            <div className="docket-head"><span>备考总览</span><small>内容版本 {content.version}</small></div>
            <div className="big-stat"><strong>{stats.theoryQuestions}</strong><span>道理论复习题</span></div>
            <div className="docket-grid">
              <div><strong>{stats.officialTheoryAnswers}</strong><span>手册原题答案</span></div>
              <div><strong>{referenceAnswers}</strong><span>公开题库核对</span></div>
              <div><strong>{reviewedAnswers}</strong><span>本站逐题复核</span></div>
              <div><strong>{stats.practicalTasks}</strong><span>实操题</span></div>
            </div>
            <div className="seal" aria-hidden>三级<br />备考</div>
          </aside>
        </div>
      </section>

      <section className="container section-block">
        <div className="section-heading">
          <div><p className="eyebrow">按考试路径学习</p><h2>从知识点，到考场节奏</h2></div>
          <p>练习、订正、模拟、实操，所有进度都围绕同一份内容版本保存。</p>
        </div>
        <div className="path-grid">
          <Link className="path-card" href="/theory"><span className="path-number">壹</span><h3>理论题库</h3><p>判断、单选、多选，按领域筛选；即时评分、错题与收藏。</p><b>900 道全题库 →</b></Link>
          <Link className="path-card featured" href="/theory/mock"><span className="path-number">贰</span><h3>90 分钟模拟</h3><p>官方卷或随机卷，190 题、100 分，完全按规则计分。</p><b>进入模拟考场 →</b></Link>
          <Link className="path-card" href="/practical"><span className="path-number">叁</span><h3>实操与实验</h3><p>逐项对照官方评分表，Python 代码直接在浏览器运行。</p><b>40 道实操题 →</b></Link>
        </div>
      </section>

      <section className="ink-band">
        <div className="container proof-grid">
          <div><p className="eyebrow light">答案透明度</p><h2>知道答案从哪里来，<br />也知道该信到什么程度。</h2></div>
          <div className="proof-items">
            <article><span className="source-badge official">答案来源：指导手册</span><p>190 道理论模拟题和 6 道实操模拟题保留手册原答案，并逐题精确映射。</p></article>
            <article><span className="source-badge derived">答案来源：公开参考题库</span><p>{referenceAnswers} 道答案经过题型、序号、题干和选项四项严格匹配；答案占位括号只按受限规则规范化。</p></article>
            <article><span className="source-badge derived">答案来源：本站逐题复核</span><p>{reviewedAnswers} 道无争议题已逐题复核并绑定内容哈希；其余 {heuristicAnswers} 道仍明确标为本站知识点整理。</p></article>
          </div>
        </div>
      </section>

      <section className="container section-block lab-promo">
        <div className="lab-window" aria-hidden>
          <div className="lab-window-bar"><i></i><i></i><i></i><span>浏览器 Python 实验室</span></div>
          <pre><code><span className="code-key">import</span> pandas <span className="code-key">as</span> pd{"\n"}data = pd.read_csv(<span className="code-string">&quot;patient_data.csv&quot;</span>){"\n"}<span className="code-comment"># 清洗、分析、建模，全在本机运行</span>{"\n"}data.describe()</code></pre>
          <div className="lab-result">浏览器内核 · 按需启动　原始模板 · 一键恢复</div>
        </div>
        <div className="lab-copy"><p className="eyebrow">无需安装本机环境</p><h2>在浏览器中启动完整 Notebook</h2><p>首次打开会准备 Python 内核和题目素材；代码在独立浏览器内核中执行。支持数据处理、机器学习、图表与 ONNX 浏览器模型实验，并提供原始模板恢复。</p><Link className="text-link" href="/practical?lab=1">查看 {stats.notebookTasks} 个在线实验 →</Link></div>
      </section>
    </main>
  );
}
