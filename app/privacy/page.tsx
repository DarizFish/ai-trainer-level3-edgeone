import Link from "next/link";
import LegalPage from "@/components/LegalPage";

export const metadata = {
  title: "隐私政策",
  description: "本站收集哪些数据、为什么收集、存放在哪里，以及如何删除。",
};

// 面向学员而不是工程师：只说收了什么、为什么、放在哪、怎么删。算法名称、Cookie 属性、
// 存储 API 这些实现细节不写——它们不改变用户的判断，只会让人读不下去。
// 中文段落一律写成单行：JSX 里换行缩进会被渲染成一个空格，中文句子中间会平白多出空隙。
const collected: Array<[string, string, string]> = [
  ["邮箱地址", "账号标识与登录", "注册时由你填写"],
  ["昵称", "页面上显示的称呼", "注册时由你填写，留空则取邮箱前缀"],
  ["密码", "登录校验", "只保存加密后的校验值，不保存明文；我们无法查看或还原你的密码"],
  ["学习记录", "展示学习档案与错题", "你答题、交卷、自评分、收藏、保存草稿时产生"],
  ["登录状态", "让你 30 天内免于重复登录", "登录时生成，退出登录即失效"],
  ["IP 地址与访问时间", "限制注册与登录频率，防止恶意批量注册和撞库", "你注册或登录时记录"],
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="数据处理"
      title="隐私政策"
      summary="本站不投放广告、不接入任何第三方统计或追踪服务，也不会出售或共享你的数据。"
    >
      <section>
        <h2>一、收集哪些信息</h2>
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead><tr><th>信息</th><th>用途</th><th>说明</th></tr></thead>
            <tbody>
              {collected.map(([item, purpose, note]) => (
                <tr key={item}><th scope="row">{item}</th><td>{purpose}</td><td>{note}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>本站<b>不收集</b>真实姓名、身份证号、手机号、支付信息、地理位置或通讯录。不登录也可以浏览题库、做模拟考试和使用实验环境，此时不产生任何账号数据。</p>
      </section>
      <section>
        <h2>二、Cookie</h2>
        <p>本站只使用一个 Cookie，用途仅是在你登录后保持登录状态，有效期 30 天，退出登录即清除。本站<b>没有</b>广告 Cookie、统计 Cookie 或任何跨站追踪标识，因此也不需要 Cookie 同意弹窗。</p>
      </section>
      <section>
        <h2>三、浏览器本地存储</h2>
        <p>为了让你切换页面不丢答案、断网也能继续做题，本站会把答题状态和草稿保存在你自己的浏览器里；实操实验还会缓存运行所需的 Python 环境（首次进入约数十 MB）。这些数据存在你的设备上，不会自动上传；清除浏览器的站点数据即可删除。</p>
      </section>
      <section>
        <h2>四、数据存放在哪里</h2>
        <p>账号与学习记录存放在 Supabase 托管的数据库，机房位于<b>日本东京</b>。网站本身部署在腾讯云 EdgeOne 的<b>中国大陆境外</b>节点。也就是说，你的数据存储与处理均发生在中国大陆境外。</p>
      </section>
      <section>
        <h2>五、保留多久</h2>
        <ul>
          <li>登录状态：30 天后自动失效；主动退出登录会立即清除。</li>
          <li>频率限制记录（含 IP）：最长 24 小时后清除。</li>
          <li>账号与学习记录：保留至你要求删除为止。</li>
        </ul>
      </section>
      <section>
        <h2>六、你的权利</h2>
        <ul>
          <li>在<Link href="/progress">学习档案</Link>页可以自助重置某一理论题型或某一实操章节的学习记录，重置后该部分记录会被直接删除。</li>
          <li>需要导出全部数据，或彻底注销账号并删除所有记录，请通过页尾邮箱联系我们。</li>
        </ul>
      </section>
      <section>
        <h2>七、第三方</h2>
        <p>除为运行本站所必需的托管服务商（Supabase 提供数据库、腾讯云 EdgeOne 提供网站托管与加速）外，本站不向任何第三方提供你的数据。站内没有广告脚本、统计脚本、埋点或社交插件。</p>
      </section>
      <section>
        <h2>八、政策变更</h2>
        <p>本政策如有修改，本页顶部的更新日期会一并变更。</p>
      </section>
    </LegalPage>
  );
}
