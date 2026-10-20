import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "微信小程序",
  description: "人工智能训练师三级备考微信小程序：理论刷题、限时模考与实操填空。微信扫码打开，随时接着练。",
};

const screenshots = [
  { src: "/miniprogram/theory-types.png", title: "按题型，接着上次练", description: "判断、单选、多选分别记录进度，错题和收藏随时回看。", alt: "小程序理论练习页：三种题型独立进度，以及错题和收藏入口" },
  { src: "/miniprogram/theory-question.png", title: "做完一题，及时核对", description: "随手练习、查看解析，把零散时间用在容易出错的题上。", alt: "小程序理论题作答页和答案解析" },
  { src: "/miniprogram/practical-code.png", title: "带着上下文，练实操", description: "阅读完整代码，在横线处填写，按需查看参考答案。", alt: "小程序实操页：在完整 Python 代码上下文中直接填写空白" },
] as const;

export default function MiniProgramPage() {
  return (
    <main className="container workspace miniprogram-page">
      <div className="breadcrumbs"><Link href="/">首页</Link>　/　微信小程序</div>
      <section className="miniprogram-hero" aria-labelledby="miniprogram-title">
        <div className="miniprogram-intro">
          <p className="eyebrow">微信小程序 · 已上线</p>
          <h1 id="miniprogram-title">手机刷题，<br /><em>随时接着练。</em></h1>
          <p className="miniprogram-lede">人工智能训练师三级备考</p>
          <p>理论练习、限时模考、实操填空。通勤路上、休息片刻，打开微信就能开始。</p>
          <ul className="miniprogram-highlights" aria-label="小程序主要功能">
            <li><strong>900</strong><span>道理论题</span></li>
            <li><strong>190</strong><span>题标准模考</span></li>
            <li><strong>40</strong><span>道实操填空</span></li>
          </ul>
          <p className="miniprogram-account-note">可以直接以访客身份练习；登录网站同一邮箱账号，可同步理论学习记录。</p>
        </div>
        <aside className="miniprogram-code-card" aria-label="扫码打开小程序">
          <span className="miniprogram-code-label">微信扫一扫</span>
          <h2>人工智能训练师三级备考</h2>
          <Image className="miniprogram-code" src="/miniprogram/code.jpg" alt="人工智能训练师三级备考正式小程序码，使用微信扫码打开" width={430} height={430} unoptimized preload />
          <p>微信扫码，打开小程序</p>
          <a className="button button-quiet" href="/miniprogram/code.jpg" download="人工智能训练师三级备考-小程序码.jpg">保存小程序码</a>
          <small>手机浏览时，可保存图片后，在微信「扫一扫」中从相册选择识别。</small>
        </aside>
      </section>

      <section className="miniprogram-preview" aria-labelledby="miniprogram-preview-title">
        <div className="section-heading"><div><p className="eyebrow">先看一看</p><h2 id="miniprogram-preview-title">从一道题开始。</h2></div><p>按自己的节奏练习，遇到难题就收藏，想巩固时再回来。</p></div>
        <div className="miniprogram-screenshots">
          {screenshots.map((shot, index) => <figure key={shot.src}>
            <figcaption><span>0{index + 1}</span><h3>{shot.title}</h3><p>{shot.description}</p></figcaption>
            <a href={shot.src} target="_blank" rel="noopener noreferrer" aria-label={`查看大图：${shot.title}`}><Image src={shot.src} alt={shot.alt} width={726} height={1570} sizes="(max-width: 700px) 78vw, (max-width: 1000px) 42vw, 320px" unoptimized /></a>
          </figure>)}
        </div>
      </section>

      <section className="miniprogram-desktop" aria-labelledby="miniprogram-desktop-title">
        <div><p className="eyebrow">电脑上继续</p><h2 id="miniprogram-desktop-title">需要运行 Python 时，回到网站。</h2><p>小程序适合刷题和实操填空。要运行代码、查看结果或导出实验文件，在电脑打开本站，找到同一题号即可。</p></div>
        <Link className="button button-primary" href="/practical">前往实操题库 <span aria-hidden="true">→</span></Link>
      </section>
    </main>
  );
}
