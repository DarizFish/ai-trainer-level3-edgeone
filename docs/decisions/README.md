# 决策记录

本目录回答一个问题：**为什么做出某个重要决定。**

不记录结论就完事——每条要写清当时的问题、考虑过哪些方案、为什么采用当前方案、
依赖哪些假设。判断依据变化时，追加新条目并注明它取代了哪一条，不要原地改写历史。

**登记门槛：只收「改变了会造成事故」的决定。** 常规实现选择不进这里，它们由代码、
提交信息和 `IMPROVEMENTS.md` 承载。判断标准是：如果下一个人不知道这条，他会不会
在合理推理之后做出错误改动？会，才登记。

## 索引

| 决策 | 现状 | 记录 |
| --- | --- | --- |
| Lab 不得进入跨源隔离（COOP/COEP） | 生效中 | [001](001-lab-no-cross-origin-isolation.md) |
| 网站运营功能的产品边界 | 生效中 | [`../SITE-OPERATIONS-ANALYSIS.md`](../SITE-OPERATIONS-ANALYSIS.md) 记录取舍，[`../SITE-OPERATIONS-PRODUCT-REQUIREMENTS.md`](../SITE-OPERATIONS-PRODUCT-REQUIREMENTS.md) 是当前边界 |
| 单机双槽容器发布、独立人工切流 | 生产预备与切流已验证；显式回退未演练 | [003](003-single-host-blue-green-container-release.md)，操作见 [`../SELF-HOSTING.md`](../SELF-HOSTING.md) |
