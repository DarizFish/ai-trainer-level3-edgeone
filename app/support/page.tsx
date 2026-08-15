import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { voluntarySupportEnabled } from "@/lib/features";
import { SITE_CONTACT_EMAIL } from "@/lib/site";

export const metadata = {
  title: "支持本站",
  description: "自愿支持人工智能训练师三级备考站的域名、服务器和内容维护。",
};

export default function SupportPage() {
  // 页面整体保留，等真实收款码到位后把开关打开即可，不需要重新实现一遍。
  if (!voluntarySupportEnabled) redirect("/");

  return (
    <main className="container workspace support-page">
      <header className="resources-page-head">
        <div className="breadcrumbs"><Link href="/">首页</Link>　/　支持本站</div>
        <p className="eyebrow">自愿赞赏</p>
        <h1>让免费题库，<br />继续被认真维护。</h1>
        <p>本站的题库、答案、模拟考试和实验环境始终免费开放。如果它确实帮到了你，可以自愿支持域名、服务器和资料维护。</p>
      </header>

      <section className="support-layout">
        <div className="support-copy">
          <p className="support-promise"><b>不赞赏，不影响任何功能。</b>赞赏不会解锁答案、报名服务、证书、会员身份或一对一辅导。</p>
          <div className="support-principles">
            <article><span>01</span><div><b>完全自愿</b><p>请在已经获得实际帮助后再决定，不设置金额目标和倒计时。</p></div></article>
            <article><span>02</span><div><b>不收集支付数据</b><p>本站不创建订单，也不记录姓名、金额、留言或支付单号。</p></div></article>
            <article><span>03</span><div><b>谨防冒充</b><p>本站不会私信索要转账、验证码或报名材料；未成年人请勿赞赏。</p></div></article>
          </div>
          <p className="support-contact">对赞赏入口有疑问，可联系 <a href={`mailto:${SITE_CONTACT_EMAIL}`}>{SITE_CONTACT_EMAIL}</a>。</p>
        </div>

        <figure className="support-code-card">
          <div><Image src="/support-code-placeholder.svg" alt="收款码占位图，当前不可用于支付" width={640} height={640} priority /></div>
          <figcaption><b>收款码占位图</b><span>当前暂不收款；站点负责人替换图片并完成真实手机验收后启用。</span></figcaption>
        </figure>
      </section>
    </main>
  );
}
