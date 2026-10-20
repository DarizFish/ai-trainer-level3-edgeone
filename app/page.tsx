import IntentLink from "@/components/IntentLink";
import { content } from "@/lib/content";
import { HomeAccountCta } from "@/components/AccountSession";
import { voluntarySupportEnabled } from "@/lib/features";

export default function HomePage() {
  const stats = content.stats;

  return (
    <main>
      <section className="hero paper-texture">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">国家职业技能等级 · 三级</p>
            <h1>把厚厚的指导手册，<br /><em>练成你的分数。</em></h1>
            <p className="lede">理论题库与模拟考试之外，实操题支持自动准备环境、浏览器直接运行 Python、逐项对照答案和一键恢复原始模板。</p>
            <HomeAccountCta />
          </div>
          <aside className="exam-docket" aria-label="题库概览">
            <div className="docket-head"><span>备考总览</span><small>内容版本 {content.version}</small></div>
            <div className="big-stat"><strong>{stats.theoryQuestions}</strong><span>道理论复习题</span></div>
            <div className="docket-grid">
              <div><strong>{stats.officialTheoryAnswers}</strong><span>道模拟考试题</span></div>
              <div><strong>5</strong><span>个理论知识领域</span></div>
              <div><strong>{stats.notebookTasks}</strong><span>个 Python 实验</span></div>
              <div><strong>{stats.practicalTasks}</strong><span>实操题</span></div>
            </div>
            <div className="seal" aria-hidden>三级<br />备考</div>
          </aside>
        </div>
      </section>

      {voluntarySupportEnabled && (
        <section className="home-support-band" aria-labelledby="home-support-title">
          <div className="container home-support-row">
            <div><p className="eyebrow">保持免费开放</p><h2 id="home-support-title">觉得有帮助，可以支持本站继续维护。</h2><p>不支持也不影响任何题库、答案、实验或账号功能。</p></div>
            <IntentLink className="button button-quiet" href="/support">了解如何支持</IntentLink>
          </div>
        </section>
      )}

      <section className="container section-block">
        <div className="section-heading">
          <div><p className="eyebrow">按考试路径学习</p><h2>从知识点，到考场节奏</h2></div>
          <p>练习、订正、模拟、实操，所有进度都围绕同一份内容版本保存。</p>
        </div>
        <div className="path-grid">
          <IntentLink className="path-card" href="/theory"><span className="path-number">壹</span><h3>理论题库</h3><p>判断、单选、多选独立进度；即时评分、错题与收藏。</p><b>900 道理论题 →</b></IntentLink>
          <IntentLink className="path-card" href="/theory/mock"><span className="path-number">贰</span><h3>90 分钟模拟</h3><p>标准卷或随机卷，190 题、100 分，完全按规则计分。</p><b>进入模拟考场 →</b></IntentLink>
          <IntentLink className="path-card featured" href="/practical"><span className="path-number">叁</span><h3>实操与实验</h3><p>环境自动准备，Python 浏览器运行；完成后逐项对照答案。</p><b>40 道实操题 →</b></IntentLink>
        </div>
        <section className="home-practical-proof" aria-labelledby="home-practical-title">
          <div className="home-practical-copy"><p className="eyebrow light">实操强化</p><h2 id="home-practical-title">打开就能做，核对完还能恢复重练。</h2><p>从环境准备、动手作答到答案复盘，实操练习在同一个页面完成。</p><IntentLink className="button button-light" href="/practical">体验实操题库</IntentLink></div>
          <div className="home-practical-features">
            <article><span>01</span><div><b>自动准备环境</b><p>进入 Python 实验后，自动准备运行环境和题目素材。</p></div></article>
            <article><span>02</span><div><b>浏览器直接运行</b><p>无需安装本机 Python，在 Notebook 中完成代码和结果。</p></div></article>
            <article><span>03</span><div><b>答案逐项核对</b><p>Word 题逐空对照，Notebook 和交付物按任务查看参考成果。</p></div></article>
            <article><span>04</span><div><b>恢复原始模板</b><p>一键回到未作答状态，同一道题可以反复练习。</p></div></article>
          </div>
        </section>
        <div className="home-resource-callout">
          <div><span>个人报名攻略</span><p>先查资格路径，再选正规渠道；报名完成后回到本站开始备考。</p></div>
          <IntentLink className="text-link" href="/resources">查看六步报名攻略 →</IntentLink>
        </div>
      </section>

      <section className="ink-band">
        <div className="container proof-grid">
          <div><p className="eyebrow light">完整学习闭环</p><h2>每一次作答，<br />都变成下一步行动。</h2></div>
          <div className="proof-items">
            <article><strong>即时判分</strong><p>选择答案后立即反馈，减少等待，把注意力留给知识点本身。</p></article>
            <article><strong>错题回练</strong><p>自动汇总待订正题目，答对后移出错题集，让复习范围越练越小。</p></article>
            <article><strong>多设备同步</strong><p>账号同步理论作答、错题、收藏与 Notebook 草稿，换台设备也能继续。</p></article>
          </div>
        </div>
      </section>

      <section className="container section-block lab-promo">
        <div className="lab-window" aria-hidden>
          <div className="lab-window-bar"><i></i><i></i><i></i><span>浏览器 Python 实验室</span></div>
          <pre><code><span className="code-key">import</span> pandas <span className="code-key">as</span> pd{"\n"}data = pd.read_csv(<span className="code-string">&quot;patient_data.csv&quot;</span>){"\n"}<span className="code-comment"># 清洗、分析、建模，全在本机运行</span>{"\n"}data.describe()</code></pre>
          <div className="lab-result">浏览器内核 · 按需启动　原始模板 · 一键恢复</div>
        </div>
        <div className="lab-copy"><p className="eyebrow">无需安装本机环境</p><h2>在浏览器中启动完整 Notebook</h2><p>首次打开会准备 Python 内核和题目素材；代码在独立浏览器内核中执行。支持数据处理、机器学习、图表与 ONNX 浏览器模型实验，并提供原始模板恢复。</p><IntentLink className="text-link" href="/practical?lab=1">查看 {stats.notebookTasks} 个在线实验 →</IntentLink></div>
      </section>
    </main>
  );
}
