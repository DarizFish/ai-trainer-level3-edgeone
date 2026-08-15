export const practicalMockEnabled = false;

/**
 * 自愿赞赏总开关。收款码还是占位图，任何入口都会把用户领到一个不能付款的页面——
 * 与其解释「暂不收款」，不如先整条关掉。真实收款码到位并用真机验过金额与收款主体后
 * 改成 true，页面、导航、sitemap 和 /support 路由会一起恢复，不需要再改别处。
 */
export const voluntarySupportEnabled = false;
