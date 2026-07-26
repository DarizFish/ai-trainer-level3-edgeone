import IntentLink from "@/components/IntentLink";
import { content } from "@/lib/content";
import { HomeAccountCta } from "@/components/AccountSession";

export default function HomePage() {
  const stats = content.stats;

  return (
    <main>
      <section className="hero paper-texture">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">国家职业技能等级 · 三级</p>
            <h1>把厚厚的指导手册，<br /><em>练成你的分数。</em></h1>
            <p className="lede">一站覆盖理论全题库、模拟考试、实操评分细则与 20 个浏览器 Python 实验。从练习到复盘，按真实考试节奏稳步提分。</p>
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

      <section className="container section-block">
        <div className="section-heading">
          <div><p className="eyebrow">按考试路径学习</p><h2>从知识点，到考场节奏</h2></div>
          <p>练习、订正、模拟、实操，所有进度都围绕同一份内容版本保存。</p>
        </div>
        <div className="path-grid">
          <IntentLink className="path-card" href="/theory"><span className="path-number">壹</span><h3>理论题库</h3><p>判断、单选、多选独立进度；即时评分、错题与收藏。</p><b>900 道全题库 →</b></IntentLink>
          <IntentLink className="path-card featured" href="/theory/mock"><span className="path-number">贰</span><h3>90 分钟模拟</h3><p>标准卷或随机卷，190 题、100 分，完全按规则计分。</p><b>进入模拟考场 →</b></IntentLink>
          <IntentLink className="path-card" href="/practical"><span className="path-number">叁</span><h3>实操与实验</h3><p>逐项对照官方评分表，Python 代码直接在浏览器运行。</p><b>40 道实操题 →</b></IntentLink>
        </div>
        <div className="home-resource-callout">
          <div><span>上海认定信息</span><p>查看上海交通大学职业技能等级认定相关信息。</p></div>
          <IntentLink className="text-link" href="/resources">查看参考资料 →</IntentLink>
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
