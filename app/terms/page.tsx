import Link from "next/link";
import LegalPage from "@/components/LegalPage";

export const metadata = {
  title: "服务条款",
  description: "使用本站题库、模拟考试与在线实验环境的规则与边界。",
};

// 中文段落一律写成单行，理由见 privacy/page.tsx 顶部注释。
export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="使用规则"
      title="服务条款"
      summary="使用本站即表示你接受以下条款。请与《免责声明》一并阅读。"
    >
      <section>
        <h2>一、服务内容</h2>
        <p>本站免费提供理论题库、模拟考试、实操题目、在线 Python 实验环境与学习记录功能。服务按<b>现状</b>提供，可能因维护、调整或其它原因随时变更、暂停或终止，恕不另行通知。</p>
      </section>
      <section>
        <h2>二、账号</h2>
        <p>账号使用邮箱与密码注册，供本人使用。请妥善保管密码，不要与他人共享账号；通过你的账号进行的操作，均视为你本人的操作。如果怀疑账号被他人使用，请立即修改密码并联系我们。</p>
      </section>
      <section>
        <h2>三、使用限制</h2>
        <p>本站内容供个人备考学习使用。使用时请不要：</p>
        <ul>
          <li>以程序批量抓取、爬取或镜像站内题库与解析；</li>
          <li>转售站内内容，或以任何方式利用站内内容牟利；</li>
          <li>大规模再分发题库、解析或 Notebook 模板；</li>
          <li>尝试干扰服务运行、绕过访问频率限制，或未经授权访问他人账号与数据。</li>
        </ul>
      </section>
      <section>
        <h2>四、在线实验环境</h2>
        <p>实操实验基于 JupyterLite，<b>完全运行在你自己的浏览器里</b>。你编写和运行的代码不会发送到服务器；只有在你登录并保存草稿时，草稿内容才会同步到你的账号。请不要在实验环境中处理敏感、涉密或包含他人个人信息的数据。</p>
      </section>
      <section>
        <h2>五、内容权利</h2>
        <p>站内的解析文字、Notebook 模板、评分标准与页面设计由编者创作。所引用的公开资料，其权利归原权利人所有。如果你认为站内某项内容侵犯了你的合法权利，请通过页尾邮箱联系并说明具体位置，我们会尽快核实并作出处理。</p>
      </section>
      <section>
        <h2>六、未成年人</h2>
        <p>如果你未满 18 周岁，建议在监护人的了解和指导下使用本站并注册账号。</p>
      </section>
      <section>
        <h2>七、条款变更</h2>
        <p>条款如有修改，本页顶部的更新日期会一并变更。修改后继续使用本站，视为接受更新后的条款。与数据处理有关的内容另见<Link href="/privacy">隐私政策</Link>。</p>
      </section>
    </LegalPage>
  );
}
