# 人工智能训练师三级备考站——会话交接

更新时间：2026-07-25

本文用于把当前项目移交给其他 Codex 会话或 Agent。开始工作前请先阅读全文，尤其是“当前 Git 工作区状态”和“下一步操作”。

## 1. 项目目标与最终方案

原项目是 OpenAI Sites 上的“人工智能训练师三级全题库备考站”。由于 Sites 生成的站点在中国大陆无法稳定访问，曾调研：

- 域名转发到 Cloudflare Workers
- 境外服务器
- EdgeOne Pages / EdgeOne Makers
- Supabase PostgreSQL

最终选择：

- Web/API：Next.js 16
- 托管：腾讯云 EdgeOne Makers
- 数据库：Supabase PostgreSQL 东京区
- 代码仓库：GitHub
- 正式域名：https://www.aitrainer3.xyz/
- 目标：中国大陆能够访问，不要求 100% 稳定或大陆 SLA
- 不迁移历史数据，因为当时尚未正式发布
- 保留自建邮箱密码账号，不改用 Supabase Auth
- JupyterLite、Pyodide、ONNX Runtime 和模型全部随网站静态部署

EdgeOne 项目：

```text
makers-xyzgssb9k7as
```

GitHub 仓库：

```text
ssh://git@ssh.github.com:443/DarizFish/ai-trainer-level3-edgeone.git
```

本地项目：

```text
C:\Users\zd\Documents\人工智能训练师三级\edgeone-site
```

## 2. 数据库配置

Supabase 使用东京区：

```text
项目引用：sqenbhewvjnmatgkkbqy
主机：aws-0-ap-northeast-1.pooler.supabase.com
```

连接方式：

- `DATABASE_URL`：6543，Transaction Pooler，网站运行时使用
- `DIRECT_URL`：5432，Session Pooler，计划用于迁移或管理操作

真实连接字符串已放入本地 `.env.local`，不要输出、提交或复制到代码中。

需要注意：

- 当前应用运行时代码只读取 `DATABASE_URL`
- 当前 `drizzle.config.ts` 也只读取 `DATABASE_URL`，尚未自动使用 `DIRECT_URL`
- EdgeOne 生产环境必须在控制台配置 `DATABASE_URL`
- 数据库密码曾经直接发在历史会话中，建议上线稳定后旋转密码

本地开发并非所有页面都需要数据库：

- 公开题库、静态页面、JupyterLite 可以在没有数据库时加载
- 注册、登录、收藏、错题、学习进度、成绩和云端草稿需要数据库

## 3. 本地运行方式

Windows 上曾遇到两个问题：

1. 3000 端口返回 `EACCES`
2. Next.js 原生 SWC 无法加载，Turbopack 不支持 WASM fallback

因此使用 Webpack 和 3200 端口：

```powershell
cd "C:\Users\zd\Documents\人工智能训练师三级\edgeone-site"
npm.cmd run dev -- --webpack -p 3200 -H 127.0.0.1
```

访问：

```text
http://127.0.0.1:3200
```

生产构建已经固定为：

```text
next build --webpack
```

## 4. 已经提交并推送的工作

当前分支：

```text
codex/edgeone-migration
```

本地与远端当前 HEAD：

```text
b1bf16a Add end-to-end tests for public routes, runtime, and production smoke checks
```

最近提交：

```text
b1bf16a 构建公开路由、运行时和生产冒烟测试
ff2d095 修复 EdgeOne 实操模块 MIME 兼容
7043997 修复 EdgeOne 实操运行时模块加载
45a9d94 新增官方参考资料与报名入口
418c177 移除用户可见的答案来源说明
5c4c80a 减少预加载和学习进度查询
6012709 将版本化内容资源纳入部署
f4d3a1a 将题库作为不可变静态资源提供
4afe128 缓存公开路由并批量同步答题进度
731d6bc 迁移到 EdgeOne 和 PostgreSQL
```

已经上线的主要改进：

- 题库内容构建为版本化静态 JSON
- EdgeOne 对 Next 静态文件、JupyterLite、模型和运行时设置长期缓存
- 理论题答案通过前端 `isCorrect()` 直接计算
- 答题进度使用批量、延迟同步，避免每次点击都等待服务端
- 降低页面的主动预加载量
- 合并和简化学习进度数据库查询
- 删除用户可见的“答案来源”相关说明
- 增加官网参考资料、报名和政策链接
- 修复 EdgeOne 上 Pyodide 模块的 MIME 和扩展名兼容问题
- 建立合同测试、构建测试、Playwright 浏览器测试和生产冒烟测试

主要配置：

- `package.json`
- `edgeone.json`
- `TESTING.md`

## 5. 当前 Lab 故障的根因

生产环境原先出现：

```text
Failed to fetch dynamically imported module:
/lite/static/pyodide/pyodide.mjs
```

该问题已通过本地 Pyodide 模块路径和 EdgeOne MIME 配置修复。

之后出现：

```text
题目环境准备失败：环境准备单元未能成功执行
```

深入复现后捕获到真实 Python 错误：

```text
RuntimeError: 素材校验失败：sensor_data.csv
```

根因不是网络或 Pyodide 本身，而是 Git 换行转换：

- Windows 本地 `sensor_data.csv`：CRLF、604795 字节
- GitHub/EdgeOne 部署版本：LF、594794 字节
- Notebook 中保存的是 Windows 原文件哈希
- 部署后的正常 LF 文件因此被误判成损坏

已确认：

- 24 个 Lab 素材中有 10 个 CSV 受影响
- 另外 14 个文件本地和线上完全一致

## 6. Lab 修复已经在本地实施，但尚未推送

目前本地改动包含：

- `.gitattributes` 固定 `public/labs` 下 CSV/TXT/Python 使用 LF
- 素材生成时先规范换行，再计算部署哈希
- 内容审计同时保留原始素材哈希和部署哈希
- 素材下载增加 HTTP 状态检查
- 下载和依赖安装增加重试
- 素材 URL 增加内容哈希查询参数，绕过旧缓存
- 等待 Python 内核握手成功后再执行准备单元
- 并发准备请求去重
- 准备单元自动重试两次
- 提取并向外层页面回传真实 Python 错误
- 页面增加“重试准备”按钮
- 浏览器测试必须看到隐藏准备单元输出“环境已就绪”
- 生产冒烟测试核验全部 24 个 Lab 素材的长度和 SHA-256
- Lab 运行时版本升级为 `20260724-runtime9`

主要文件：

- `components/JupyterLiteLab.tsx`
- `jupyterlite-extension/src/index.ts`
- `scripts/generate-jupyterlite-notebooks.py`
- `scripts/build-jupyterlite.ps1`
- `tests/contracts.test.mjs`
- `tests/production-smoke.test.mjs`

## 7. ONNX 模型状态

量化模型已经成功生成并保存在被 Git 忽略的目录：

```text
work/browser-models/quantized
```

尺寸：

```text
resnet.onnx             26,144,288
mnist.onnx                  17,453
emotion-ferplus.onnx    21,371,123
version-RFB-320.onnx       496,523
```

但是当前 `public/labs/manifest.json` 仍然引用原始大模型：

```text
resnet.onnx            102,583,340
mnist.onnx                  26,143
emotion-ferplus.onnx    35,040,571
version-RFB-320.onnx     1,270,727
```

原因是量化完成后还没有重新运行 `labs:prepare`。提交前必须重新生成，确认 manifest 中：

```json
"sourceVariant": "browser-quantized"
```

不要提交原始大模型拆分产物。

## 8. 当前 Git 工作区状态

工作区非常不干净，必须完整保留。禁止执行 `git reset --hard`、`git checkout --`，也不能只保留 Lab 文件。

核对本文件创建前的状态：

```text
89 个工作区条目
78 个修改
3 个删除
8 个未跟踪
```

创建本文件后会额外增加一个未跟踪文件。

原有未跟踪文件包括：

```text
CHANGES-practical-lab-session.md
components/PracticalBrief.tsx
components/PracticalMaterialsList.tsx
components/PracticalTaskHeader.tsx
lib/features.ts
proxy.ts
public/lite/extensions/ai-trainer-jupyterlite/static/371.47fc104aaaf95af11c9e.js
public/lite/extensions/ai-trainer-jupyterlite/static/remoteEntry.e1c036871c986d7d325f.js
```

其中 JupyterLite 旧 hash bundle 被删除、新 hash bundle 被创建属于正常构建产物更新。

本地还包含一批尚未提交的实操页面和侧栏体验改进，详情见：

```text
CHANGES-practical-lab-session.md
```

`app/blueprint/page.tsx` 当前处于删除状态；不要自行恢复，应把它和资源页、导航调整一起审查。

## 9. 下一步必须执行的步骤

首先把 `tests/contracts.test.mjs` 中剩余两处旧版本改掉：

```text
约第 1053 行：20260724-runtime8 → 20260724-runtime9
约第 1078 行：20260724-runtime8 → 20260724-runtime9
```

随后在项目目录执行：

```powershell
npm.cmd run labs:prepare
npm.cmd run content:practical-materials
npm.cmd run jupyterlite:build
```

检查 `public/labs/manifest.json` 已使用量化模型，而不是原始模型。

然后执行完整测试：

```powershell
npm.cmd run test:full
git diff --check
```

全部通过后：

```powershell
git add -A
git commit -m "修复实操环境准备与素材校验"
git push origin codex/edgeone-migration
```

推送会触发 EdgeOne 自动部署。

## 10. 部署后验收

等待 EdgeOne 完成后：

```powershell
$env:SMOKE_WAIT_MS="300000"
npm.cmd run test:smoke
```

再对正式站运行浏览器测试：

```powershell
$env:TEST_BASE_URL="https://www.aitrainer3.xyz"
npx.cmd playwright test tests/e2e/runtime.spec.mjs
```

重点人工验证：

- 任意普通 CSV Lab 能显示“环境已就绪”
- 题目 `1.1.2` 的 `sensor_data.csv` 不再校验失败
- 3.2.x ONNX 题能下载模型并执行推理
- 首次加载、刷新、连续重试均可恢复
- 错误时页面能显示真实失败原因
- “重试准备”按钮有效
- Chrome 控制台没有 Pyodide MIME、动态 import 或模型分片错误
- 理论题、模拟考试、实操题库、实操组卷、参考资料、学习档案路由正常

## 11. 当前结论

正式站已经可以访问，基础迁移、性能优化、参考资料和测试体系已经上线。

最新一轮 Lab 素材校验和环境准备修复代码已基本完成，但仍需：

1. 统一剩余的 runtime 版本断言
2. 使用量化模型重新生成 Lab 资源
3. 完成 JupyterLite 构建
4. 运行完整测试
5. 提交并推送全部现有修改
6. 等待 EdgeOne 部署并执行正式站验收
