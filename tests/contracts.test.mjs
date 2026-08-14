import assert from "node:assert/strict";

// 题库来自 data/entities/ 的实体层，不再有 data/content.json 这个单行大文件。
const loadContentBank = async () => (await import("../scripts/assemble-entities.mjs")).assembleBank();
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

// 写断言时区分「产品意图」和「某一版的写法」。断言意图，不要断言实现细节——否则测试
// 会反过来保护缺陷：改进撞红灯，只能改断言才能放行，而那一刻很容易顺手把意图也一起改掉。
//
// 本仓库真实踩过的三次：
//   - doesNotMatch(/fetch\(/) 把「答题纸只存本机」写成契约，而界面承诺草稿会保存；
//     补跨设备同步时被它挡住。应当只禁止官方判分，不禁止同步草稿。
//   - CORRECT_AUTO_ADVANCE_MS = 450 把「答对后解析一闪而过」钉死；应当断言下限
//     （够读完反馈），而不是某个具体毫秒数。
//   - 「草稿与核分自动保存在当前浏览器」这句文案被钉死，接上同步后文案该改却改不动。
//
// 经验：可调参数（超时、迭代次数、间隔）断言范围；用户可见承诺断言语义；只有真正
// 不可变的契约（版本号、哈希、官方原文）才钉精确值。

test("completed Chinese exam-prep homepage contains product-specific content", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(page, /国家职业技能等级/);
  assert.match(layout, /人工智能训练师/);
  assert.match(page, /theoryQuestions/);
  assert.match(page, /practicalTasks/);
  assert.match(page, /notebookTasks/);
  assert.match(page, /原始模板 · 一键恢复/);
  assert.doesNotMatch(page, /模板异常/);
  assert.match(layout, /AccountProvider/);
  assert.match(layout, /AccountControls/);
  assert.doesNotMatch(`${page}${layout}`, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("resources page only keeps the Shanghai Jiao Tong University skill entry", async () => {
  const [resources, layout, homepage, progress] = await Promise.all([
    readFile(new URL("../app/resources/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ProgressDashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(resources, /https:\/\/gjzs\.sjtu\.edu\.cn\/skill/);
  assert.doesNotMatch(resources, /mohrss\.gov\.cn|osta\.org\.cn|xzy\.mohrss\.gov\.cn/);
  assert.match(resources, /target="_blank"/);
  assert.match(resources, /rel="noopener noreferrer"/);
  assert.match(resources, /上海交通大学职业技能等级认定/);
  assert.match(layout, /\["参考资料", "\/resources"\]/);
  assert.match(layout, /人工智能训练师（上海）/);
  assert.doesNotMatch(layout, /认定方案|\/blueprint/);
  assert.match(homepage, /href="\/resources"/);
  assert.doesNotMatch(progress, /href="\/blueprint"/);
});

test("theory and practical content pages remain public while progress is protected", async () => {
  const publicPages = ["../app/theory/page.tsx", "../app/practical/page.tsx", "../app/theory/mock/page.tsx"];
  for (const path of publicPages) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /requireAccountUser/);
    assert.doesNotMatch(source, /getAccountUser|searchParams/);
    assert.match(source, /force-static/);
  }
  const progress = await readFile(new URL("../app/progress/page.tsx", import.meta.url), "utf8");
  assert.match(progress, /requireAccountUser/);
});

test("practical mock is hidden and blocked behind a centralized feature flag", async () => {
  const [features, layout, catalog, page, proxy, practicalApi] = await Promise.all([
    readFile(new URL("../lib/features.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalCatalog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/practical/mock/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../proxy.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/practical/attempt/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(features, /practicalMockEnabled = false/);
  for (const source of [layout, catalog, page, proxy, practicalApi]) {
    assert.match(source, /practicalMockEnabled/);
  }
  assert.doesNotMatch(catalog, /href="\/progress"/);
  assert.match(page, /redirect\("\/practical"\)/);
  assert.match(proxy, /matcher: \["\/practical\/mock\/:path\*"\]/);
  assert.match(proxy, /NextResponse\.redirect\(new URL\("\/practical"/);
  assert.match(practicalApi, /status: 404/);
});

test("public route shells are static while answer scoring is immediate and persistence is batched", async () => {
  const [layout, intentLink, publicContent, theoryPage, practicalPage, theoryPractice, theoryAnswer, progressPage, dashboard] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/IntentLink.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/generate-public-content.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/theory/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/practical/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/TheoryPractice.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/theory/answer/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/progress/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ProgressDashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(layout, /headers\(\)|getAccountUser/);
  assert.doesNotMatch(layout, /content\/(?:theory|practical)-/);
  assert.match(intentLink, /prefetch=\{false\}/);
  assert.match(intentLink, /router\.prefetch\(href\)/);
  assert.match(theoryPage, /rel="preload"/);
  assert.match(theoryPage, /contentAssets\.theory/);
  assert.match(practicalPage, /contentAssets\.practicalCatalog/);
  assert.match(publicContent, /theory-\$\{content\.version\}/);
  assert.match(publicContent, /practical-\$\{content\.version\}/);
  assert.match(publicContent, /practical-catalog-\$\{content\.version\}/);
  assert.match(theoryPractice, /const correct = isCorrect\(question, answer\)/);
  assert.match(theoryPractice, /pendingAnswersRef/);
  assert.match(theoryPractice, /progressInFlightRef\.current/);
  assert.match(theoryPractice, /slice\(0, PROGRESS_BATCH_SIZE\)/);
  assert.match(theoryPractice, /AbortSignal\.timeout\(PROGRESS_REQUEST_TIMEOUT_MS\)/);
  assert.match(theoryPractice, /PROGRESS_RETRY_BASE_MS \* 2 \*\*/);
  assert.match(theoryPractice, /progressTimerRef\.current = null;\s+flushProgress\(\);\s+}, 900\)/);
  assert.match(theoryAnswer, /Array\.isArray\(payload\.attempts\)/);
  assert.match(theoryAnswer, /excluded\.attempts/);
  assert.match(theoryAnswer, /withDbDeadline\("theory\.answer\.upsert"/);
  assert.match(theoryAnswer, /databaseUnavailable\("theory\.answer\.upsert"/);
  assert.match(progressPage, /initialData=\{progress\}/);
  assert.doesNotMatch(dashboard, /fetch\("\/api\/progress"/);
});

test("database deadlines retire a poisoned singleton connection before EdgeOne times out", async () => {
  const [database, accountAuth] = await Promise.all([
    readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/account-auth.ts", import.meta.url), "utf8"),
  ]);

  assert.match(database, /DATABASE_OPERATION_TIMEOUT_MS = 8_000/);
  assert.match(database, /connect_timeout: 5/);
  assert.match(database, /client\.end\(\{ timeout: 0 \}\)/);
  assert.match(database, /aiTrainerDatabase = undefined/);
  assert.match(database, /aiTrainerPostgres = undefined/);
  assert.match(database, /databaseGlobal\.aiTrainerPostgres !== client/);
  assert.match(accountAuth, /withDbDeadline\("account\.session\.lookup"/);
});

// 连接池是 max: 1。一条没有 deadline 的语句卡住，就会把该函数实例后续所有请求一起
// 堵到 EdgeOne 的 30 秒上限——0232686 修的正是这个，只是当时只堵住了两个入口。
// 与其逐个文件写正则（漏一个就是一次线上事故），不如钉住那条不变量本身：
// 请求路径上不许再出现裸 getDb()。
test("every request-facing database call is bounded by a deadline", async () => {
  const apiDirectory = new URL("../app/api/", import.meta.url);
  const routes = [];
  const collect = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      if (entry.isDirectory()) await collect(child);
      else if (entry.name === "route.ts") routes.push(child);
    }
  };
  await collect(apiDirectory);
  assert.ok(routes.length >= 13, `expected the full API surface, found ${routes.length} routes`);

  // getDb() 本身没有超时保护，只有 withDbDeadline 会在超时后退掉那条连接。
  // 这两个 lib 也在请求路径上，一并覆盖。
  const guarded = [
    ...routes,
    new URL("../lib/progress-data.ts", import.meta.url),
    new URL("../lib/account-auth.ts", import.meta.url),
  ];
  for (const file of guarded) {
    const source = await readFile(file, "utf8");
    const name = file.pathname.split("/api/")[1] ?? file.pathname.split("/").pop();
    assert.doesNotMatch(source, /\bgetDb\(\)/, `${name} 走了没有 deadline 的 getDb()`);
  }

  // 限流是登录注册的第一条语句，它卡住等于账号体系整体卡住；显式传执行器的那条
  // 分支是给事务用的，不能因此把默认路径也退回裸 getDb()。
  const throttle = await readFile(new URL("../lib/auth-throttle.ts", import.meta.url), "utf8");
  assert.match(throttle, /withDbDeadline\(operation, \(client\) => client\.execute/);
  assert.match(throttle, /withDbDeadline\("auth\.throttle\.sweep"/);

  // 超时要转成可重试的 503，而不是 500——客户端只对 503 + Retry-After 退避重试。
  const apiDb = await readFile(new URL("../lib/api-db.ts", import.meta.url), "utf8");
  assert.match(apiDb, /status: 503/);
  assert.match(apiDb, /"Retry-After": "2"/);
  assert.match(apiDb, /if \(!isDatabaseUnavailable\(cause\)\) throw cause;/);

  // 登录/注册有自己的 stage 式错误映射，正则匹配的是连接类字样，对不上超时文案。
  for (const route of ["login", "register"]) {
    const source = await readFile(new URL(`../app/api/auth/${route}/route.ts`, import.meta.url), "utf8");
    assert.match(source, /isDatabaseUnavailable\(cause\) \|\|/, `${route} 会把数据库超时错报成 500`);
  }
});

test("versioned public content banks exactly match the source content", async () => {
  const [content, assets] = await Promise.all([
    loadContentBank(),
    readFile(new URL("../data/content-assets.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  const read = (url) => readFile(new URL(`../public${url}`, import.meta.url), "utf8");
  const [theory, practical, catalog] = await Promise.all(
    [assets.theory, assets.practical, assets.practicalCatalog].map(url => read(url).then(JSON.parse)),
  );
  assert.equal(theory.version, content.version);
  assert.deepEqual(theory.questions, content.theory);
  assert.deepEqual(theory.officialQuestionIds, content.officialTheoryMock.questionIds);
  assert.equal(practical.version, content.version);
  assert.deepEqual(practical.tasks, content.practical);
  assert.deepEqual(practical.officialTaskCodes, content.officialPracticalMockCodes);
  assert.equal(catalog.version, content.version);
  assert.deepEqual(catalog.tasks, content.practical.map((task) => ({
    category: task.category,
    code: task.code,
    descriptionExcerpt: task.description.length > 92 ? `${task.description.slice(0, 92)}…` : task.description,
    durationMinutes: task.durationMinutes,
    group: task.group,
    hasNotebook: task.hasNotebook,
    materialSummary: task.materials.length
      ? `${task.materials[0].label}${task.materials.length > 1 ? ` 等 ${task.materials.length} 份` : ""}`
      : "手册未配套文件",
    maxScore: task.maxScore,
    rubricCount: task.rubric.length,
    title: task.title,
    unit: task.unit,
  })));
});

test("公开题库按内容哈希命名，改题即换 URL，immutable 缓存不会留下旧题库", async () => {
  const [assets, nextConfig, published] = await Promise.all([
    readFile(new URL("../data/content-assets.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readdir(new URL("../public/content/", import.meta.url)),
  ]);
  // /content/* 按 immutable 发布，所以文件名必须由内容推导。只带 meta.json 的人工
  // 版本号是不够的：忘记改版本号就等于把旧题库钉死在浏览器和 CDN 里整整一年，
  // 这是 docs/STATUS.md 第 4 节记的同一类故障。
  assert.match(nextConfig, /source: "\/content\/:path\*"[\s\S]*?immutable/);
  const urls = [assets.theory, assets.practical, assets.practicalCatalog];
  for (const url of urls) {
    const digest = /\.([0-9a-f]{16})\.json$/.exec(url)?.[1];
    assert.ok(digest, `${url} 的文件名里没有内容哈希`);
    const body = await readFile(new URL(`../public${url}`, import.meta.url), "utf8");
    assert.equal(createHash("sha256").update(body).digest("hex").slice(0, 16), digest, `${url} 的哈希与内容不符`);
  }
  // 旧哈希的副本必须被清掉，否则会跟着部署一起发出去，却再没有页面引用。
  assert.deepEqual(published.sort(), urls.map(url => url.replace("/content/", "")).sort());
});

test("email accounts use versioned PostgreSQL schema, hashed passwords, and revocable sessions", async () => {
  const migrationName = (await readdir(new URL("../drizzle/", import.meta.url))).find((name) => name.endsWith(".sql"));
  assert.ok(migrationName, "a PostgreSQL migration must be generated");
  const [schema, accountSchema, migration, auth, register, login, logout, accountPage, accountForm, layout, accountSession, readme] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/account-schema.ts", import.meta.url), "utf8"),
    readFile(new URL(`../drizzle/${migrationName}`, import.meta.url), "utf8"),
    readFile(new URL("../lib/account-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/register/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/logout/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/AccountForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/AccountSession.tsx", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /passwordHash: text\("password_hash"\)/);
  assert.match(schema, /pgTable\("sessions"/);
  assert.match(schema, /onDelete: "cascade"/);
  assert.match(accountSchema, /getDb\(\)/);
  assert.doesNotMatch(accountSchema, /PRAGMA|ALTER TABLE|CREATE TABLE/);
  assert.match(migration, /CREATE TABLE "users"/);
  assert.match(migration, /"password_hash" text/);
  assert.match(auth, /PBKDF2/);
  // 断言下限而不是精确值：迭代次数是安全参数，只应升不应降，钉死会让加固动作撞红灯。
  const iterations = Number(auth.match(/PASSWORD_ITERATIONS = ([\d_]+)/)[1].replaceAll("_", ""));
  assert.ok(iterations >= 100_000, `PBKDF2 迭代次数 ${iterations} 低于安全下限 100000`);
  assert.match(auth, /HttpOnly/);
  assert.match(auth, /SameSite=Lax/);
  assert.match(register, /createPasswordRecord/);
  assert.match(register, /describeErrorChain/);
  assert.match(register, /REGISTER_\$\{stage\.toUpperCase\(\)\}/);
  assert.match(login, /verifyPassword/);
  assert.match(login, /ensureAccountSchema/);
  assert.match(logout, /deleteSession/);
  assert.match(accountPage, /force-dynamic/);
  assert.match(accountForm, /autocomplete|autoComplete/i);
  assert.match(accountForm, /无法连接账号服务/);
  assert.match(layout, /AccountControls/);
  assert.match(accountSession, /\/api\/auth\/logout/);
  assert.match(readme, /自建邮箱密码账号/);
  assert.match(readme, /不要改回 ChatGPT 登录/);
  assert.match(readme, /EdgeOne Makers/);
  assert.match(readme, /Supabase PostgreSQL/);
  assert.doesNotMatch(`${register}${login}${auth}`, /password:\s*text\(/);
});

test("theory opens as a direct study console and Python tasks enter a code-first lab", async () => {
  const [theory, theoryPage, practicalPage, practical, publicContent, detail, labPage, workbench, lab, brief, styles] = await Promise.all([
    readFile(new URL("../components/TheoryPractice.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/theory/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/practical/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalCatalog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/generate-public-content.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/practical/[code]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/practical/[code]/lab/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalLabWorkbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/JupyterLiteLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalBrief.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(theory, /practice-question-card/);
  assert.match(theory, /theory-study-nav/);
  assert.match(theory, /theory-study-layout/);
  assert.match(theory, /practice-palette/);
  assert.match(theory, /question-number-grid/);
  assert.doesNotMatch(theory, /theory-builder-panel|theory-browser|CUSTOM PRACTICE|题库检索/);
  assert.match(theory, /useState<Screen>\("practice"\)/);
  // 前进只有一颗按钮：多选题选了但没交时是「提交答案」，其余情况是「下一题」，
  // 并且放在吸底导航里——原来的提交按钮留在题目下方，多选题选项一长就得下拉才够得到。
  // 「暂不作答」的职责由这颗按钮一并承担，不再单列。判断/单选仍是选中即判分，
  // 那条行为由下面的 void submit(question, answer) 保障，不靠文案。
  assert.match(theory, /practice-nav-dock/);
  assert.match(theory, /提交答案/);
  // 只看 JSX 文本节点，免得匹配到解释这次合并的代码注释。
  assert.doesNotMatch(theory, />(暂不作答|选择答案后自动判分)</);
  assert.match(theory, /question\.type === "multi"/);
  assert.match(theory, /void submit\(question, answer\)/);
  assert.match(theory, /键盘快捷键/);
  assert.match(theory, /错题/);
  assert.doesNotMatch(theory, /公开参考题库|本站知识点整理|matchesAnswerFilter|SOURCE_OPTIONS/);
  assert.match(theory, /ai-trainer-theory-session-v6/);
  assert.match(theory, /answers\?: Record<string, string\[\]>/);
  assert.match(theory, /feedback\?: Record<string, boolean>/);
  assert.match(theory, /setRevealed\(\(current\) => \(\{[\s\S]*Object\.fromEntries/);
  assert.match(theory, /answers: sessionAnswers, feedback: sessionFeedback/);
  assert.match(theory, /stored\.contentVersion !== contentVersion/);
  assert.match(theoryPage, /contentVersion=\{content\.version\}/);
  assert.match(theory, /题型进度/);
  assert.match(theory, /typeProgress\.map/);
  assert.match(theory, /item\.answered\}\/\{item\.total/);
  assert.match(theory, /firstUnanswered/);
  assert.doesNotMatch(theory, /<p>知识领域<\/p>|<p>题库与考试<\/p>|当前练习/);
  assert.match(theory, /QUESTION_MAP_PAGE_SIZE = 50/);
  assert.match(theory, /question-map-ranges/);
  assert.match(theory, /sessionQuestions\.slice\(paletteStart, paletteEnd\)/);
  assert.match(theory, /setPalettePage\(Math\.floor\(boundedIndex \/ QUESTION_MAP_PAGE_SIZE\)\)/);
  assert.doesNotMatch(theory, /随机练 20 题|顺序练 20 题|再来 20 题|20 题/);
  assert.doesNotMatch(theory, /<select|theory-task-nav|theory-start-screen|question-number-strip/);
  assert.doesNotMatch(practicalPage, /practical-page-head/);
  assert.doesNotMatch(practicalPage, /page-hero/);
  assert.match(practical, /<aside className="practical-catalog-sidebar"/);
  assert.match(practical, /aria-label="实操题库导航"/);
  assert.match(practical, /catalog-controls/);
  assert.match(practical, /占实操总分/);
  assert.match(practical, /task\.materialSummary/);
  assert.match(practical, /task\.rubricCount/);
  assert.match(publicContent, /手册未配套文件/);
  assert.match(practical, /进入实验室/);
  assert.match(practical, /catalog-scope-buttons/);
  assert.match(practical, /hasActiveFilters &&/);
  assert.doesNotMatch(practical, /catalog-navigation|catalog-module-navigation|<select|pagination/);
  assert.match(styles, /\.practical-catalog \{ display: grid; grid-template-columns: 300px minmax\(0, 1fr\);/);
  assert.match(styles, /@media \(max-width: 980px\) \{\s+\.practical-catalog \{ grid-template-columns: 1fr; \}/);
  assert.match(styles, /\.practical-catalog-sidebar \.practical-score-track \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
  assert.match(styles, /\.catalog-results \.card-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(detail, /redirect\(`\/practical\/\$\{task\.code\}\/lab`\)/);
  assert.match(labPage, /className="lab-page"/);
  assert.match(labPage, /PracticalLabWorkbench/);
  assert.doesNotMatch(labPage, /lab-context-bar/);
  assert.doesNotMatch(labPage, /lab-flow-nav/);
  assert.doesNotMatch(labPage, /page-hero|lab-task-instructions/);
  assert.match(workbench, /lab-study-layout/);
  assert.match(workbench, /lab-task-sidebar/);
  assert.match(workbench, /lab-workspace-switcher/);
  assert.match(workbench, /PracticalBrief task=\{task\} open=\{false\}/);
  // Native dialog owns Escape. A second window keydown closer races the
  // browser cancel/close sequence and has already produced CI-only flakes.
  assert.match(brief, /onClose=\{\(\) => setDialogOpen\(false\)\}/);
  assert.doesNotMatch(brief, /addEventListener\(["']keydown["']/);
  assert.doesNotMatch(brief, /onCancel=/);
  assert.doesNotMatch(workbench, /PracticalMaterialsList|lab-rail-note|代码、结果和导出文件在 Notebook 中完成/);
  assert.ok(
    brief.indexOf("practical-full-prompt-trigger") < brief.indexOf("practical-requirement-list"),
    "the full official prompt action should appear before the requirement list",
  );
  assert.doesNotMatch(styles, /\.lab-rail-note/);
  assert.match(workbench, /activeSurface/);
  assert.doesNotMatch(workbench, /代码填空核对|activeSurface === "review"/);
  assert.match(lab, /ai-trainer:prepare-exercise/);
  assert.match(lab, /activeSurface/);
  assert.match(lab, /buildFillReferences/);
  assert.match(lab, /extractBlankAnswers/);
  assert.match(lab, /ai-trainer:set-fill-review/);
  assert.match(lab, /references: fillReferences/);
  assert.doesNotMatch(lab, /reviewNotebook|loadCodeReview|buildAnnotatedCodeBlocks|lab-fill-review|lab-annotated-code|lab-inline-code-reference|当前 Notebook 完整代码|你的填写|写法不同不代表错误/);
  assert.doesNotMatch(styles, /\.lab-fill-review|\.lab-annotated-code|\.lab-inline-code-reference|\.lab-review-switch/);
  assert.match(lab, /lab-toolbar-actions/);
  assert.match(lab, /lab-toolbar-divider/);
  assert.match(lab, /PracticalWordDeliverable/);
  assert.doesNotMatch(lab, /STEP 1|STEP 3|STEP 4|lab-inline-task|lab-answer|lab-score|PracticalMaterials/);
  assert.doesNotMatch(lab, /PracticalOutcomeCheck|reviewTarget|lab-reference-choices|lab-review-checklist|lab-review-scoring/);
  assert.doesNotMatch(lab, /lab-context-drawer|setOpenPanel|题目与评分|官方评分标准|rubric-display-list|lab-guide-drawer/);
  assert.doesNotMatch(lab, /<details className="lab-more-menu"/);
  assert.doesNotMatch(lab, /automaticRetryRef/);
  assert.match(lab, /不会自动重载/);
  assert.match(lab, /incomingById/);
  assert.match(lab, /normalizedCurrent/);
});

test("theory sidebar tracks each question type and omits redundant navigation groups", async () => {
  const [theory, theoryState, styles] = await Promise.all([
    readFile(new URL("../components/TheoryPractice.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/theory/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(theory, /题型进度/);
  assert.match(theory, /typeProgress\.map/);
  assert.match(theory, /firstUnanswered/);
  assert.match(theory, /setAnsweredIds/);
  assert.match(theoryState, /answeredIds/);
  assert.match(theoryState, /answerJson/);
  assert.match(theoryState, /progress: progressRows\.map/);
  assert.match(theory, /storedAnswers/);
  assert.match(theory, /resetResponses = true/);
  assert.match(theory, /typedQuestions\.length\} 题`,\s+false/);
  // 同理：答对后自动跳题的间隔是体验参数，约束应当是「够读完反馈」而不是某个具体数值。
  // 之前钉死 450，正是它把「解析一闪而过」固化成了契约。
  const autoAdvance = Number(theory.match(/CORRECT_AUTO_ADVANCE_MS = (\d+)/)[1]);
  assert.ok(autoAdvance >= 1500, `答对后 ${autoAdvance}ms 就跳题，来不及看判分与解析`);
  // 自动跳题必须让用户看得见：既要说明会跳，也要说明怎么停下。
  assert.match(theory, /正在自动进入下一题/);
  assert.match(theory, /点击或滚动可停留/);
  assert.match(theory, /已停留在本题/);
  // Windows 关闭系统动画时会命中 reduced-motion。倒计时可以改成分段更新，但不能
  // 完全禁用，否则自动跳题仍会发生，桌面端用户却只能看到一条静止的“进度条”。
  assert.match(styles, /practice-auto-advance-bar\s*\{[^}]*animation-duration:\s*2600ms\s*!important[^}]*animation-timing-function:\s*steps/);
  assert.doesNotMatch(styles, /prefers-reduced-motion:\s*reduce[^}]*practice-auto-advance-bar[^}]*animation:\s*none/);
  assert.match(theory, /if \(correct\) \{/);
  assert.match(theory, /goToQuestion\(currentIndex \+ 1\)/);
  assert.match(theory, /if \(currentIndex === sessionQuestions\.length - 1\) completePractice\(\)/);
  assert.match(theory, /practice-question-toolbar/);
  assert.match(theory, /practice-question-context/);
  assert.doesNotMatch(theory, /practice-focus-head|className="eyebrow">\{sessionLabel\}/);
  assert.doesNotMatch(theory, /setAnswers\(\{\}\)|setFeedback\(\{\}\)|setRevealed\(\{\}\)/);
  assert.match(styles, /theory-type-progress-track/);
  assert.doesNotMatch(theory, /<p>知识领域<\/p>|<p>题库与考试<\/p>|当前练习/);
});

test("theory types and practical chapters can reset their own progress", async () => {
  const [resetApi, theory, catalog, lab, styles, content] = await Promise.all([
    readFile(new URL("../app/api/progress/reset/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/TheoryPractice.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalCatalog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/JupyterLiteLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    loadContentBank(),
  ]);

  assert.match(resetApi, /theoryTypes.*judge.*single.*multi/);
  assert.match(resetApi, /db\.delete\(theoryProgress\)/);
  assert.match(resetApi, /inArray\(theoryProgress\.questionId, questionIds\)/);
  assert.match(resetApi, /db\.transaction/);
  assert.match(resetApi, /transaction\.delete\(practicalAttempts\)/);
  assert.match(resetApi, /transaction\.delete\(codeDrafts\)/);
  assert.match(theory, /resetTypeProgress/);
  assert.match(theory, /scope: "theory", type: selectedType/);
  assert.match(theory, /收藏不会删除/);
  assert.match(catalog, /章节进度重置/);
  assert.match(catalog, /scope: "practical", group/);
  assert.match(catalog, /ai-trainer-practical-reset:/);
  assert.match(catalog, /评分、作答与草稿将被清除/);
  assert.match(lab, /ai-trainer-practical-reset:/);
  assert.match(lab, /await applyNotebook\(baseline\)/);
  assert.match(lab, /章节进度已重置，已恢复原始 Notebook/);
  assert.match(styles, /\.practical-progress-reset-row/);
  assert.deepEqual([...new Set(content.practical.map((task) => task.group))], ["1.1", "1.2", "2.1", "2.2", "3.1", "3.2", "4.1", "4.2"]);
});

test("code drafts retain the last writer IP without exposing it to the browser", async () => {
  const [schema, route, migrationNames] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/drafts/[code]/route.ts", import.meta.url), "utf8"),
    readdir(new URL("../drizzle/", import.meta.url)),
  ]);
  const migrations = (await Promise.all(migrationNames
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8"))))
    .join("\n");

  assert.match(schema, /ip: text\("ip"\)/);
  assert.match(migrations, /ALTER TABLE "code_drafts" ADD COLUMN "ip" text/);
  assert.match(route, /clientAddress\(request\)/);
  assert.match(route, /values\(\{[\s\S]*ip,[\s\S]*\}\)\.onConflictDoUpdate/);
  assert.match(route, /set: \{[^}]*ip,/);
  assert.match(route, /select\(draftResponseColumns\)/);
  assert.doesNotMatch(route, /ip: codeDrafts\.ip/);
});

test("content and lab manifests contain the complete versioned bank", async () => {
  const content = await loadContentBank();
  const manifest = JSON.parse(await readFile(new URL("../public/labs/manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(content.stats, { theoryQuestions: 900, officialTheoryAnswers: 190, derivedTheoryAnswers: 710, practicalTasks: 40, notebookTasks: 20, officialPracticalAnswers: 6 });
  assert.equal(Object.keys(manifest.tasks).length, 20);
  assert.ok(Object.values(manifest.models).every((model) => model.chunks.every((chunk) => chunk.size <= 16 * 1024 * 1024)));
  assert.ok(Object.values(manifest.models).every((model) => model.sourceVariant === "browser-quantized"));
  assert.equal(content.practical.filter((task) => task.materials.length > 0).length, 35);
  assert.equal(content.practical.flatMap((task) => task.materials).length, 74);
  for (const code of ["3.1.1", "3.1.2", "3.1.3", "3.1.4", "3.1.5"]) {
    const task = content.practical.find((item) => item.code === code);
    assert.equal(task.materials.filter((material) => material.kind === "spreadsheet").length, 1);
  }
  const wordPreviewTasks = content.practical.filter((task) => ["4.1", "4.2"].includes(task.group));
  assert.equal(wordPreviewTasks.length, 10);
  assert.ok(wordPreviewTasks.every((task) => task.materials.filter((material) => material.preview?.length).length === 1));
  assert.ok(wordPreviewTasks.filter((task) => task.group === "4.1").every((task) => task.materials[0].preview.filter((block) => block.text === "学习目标：").length === 5));
  assert.ok(wordPreviewTasks.filter((task) => task.group === "4.2").every((task) => task.materials[0].preview.filter((block) => /_{5,}/.test(block.text)).length === 5));
});

test("practical source audit covers every official task, rubric, material, and deliverable workspace", async () => {
  const [content, sourceAudit, materialAudit, catalog, workspace, materials, examWorkspace, outcomeCheck, practicalApi, scoring, practicalMock, practicalStorage, contentRequirements, styles] = await Promise.all([
    loadContentBank(),
    readFile(new URL("../data/references/practical-source-audit.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/references/practical-material-audit.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../components/PracticalCatalog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalMaterials.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalExamTaskWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalOutcomeCheck.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/practical/attempt/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/scoring.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalMock.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/practical-exam-storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../requirements-content.txt", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const rubricItems = content.practical.flatMap((task) => task.rubric);
  assert.deepEqual(sourceAudit.summary, { tasks: 40, titleMatches: 40, descriptionMatches: 40, rubricCountMatches: 40, rubricItemChecks: 297, rubricItemExactMatches: 297 });
  assert.equal(materialAudit.summary.sourceDirectories, 35);
  assert.equal(materialAudit.summary.tasksWithMaterials, 35);
  assert.deepEqual(materialAudit.summary.tasksWithoutOfficialFiles, ["1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5"]);
  assert.deepEqual(materialAudit.summary.orphanSourceDirectories, []);
  assert.equal(materialAudit.summary.materialFiles, 74);
  assert.equal(materialAudit.summary.sourceTreeSha256, "3f2bd85018e21d8ba11cee6fb9b6f624734122fd79f58dec647eb492261cb1ab");
  assert.equal(materialAudit.summary.sourceFilesRegistered, 74);
  assert.equal(materialAudit.summary.exactBrowserCopies, 49);
  assert.equal(materialAudit.summary.browserDeliveriesVerified, 74);
  assert.equal(materialAudit.summary.tasksFullyRegistered, 40);
  assert.ok(materialAudit.tasks.every(task => task.allSourceFilesRegistered));
  assert.ok(materialAudit.tasks.flatMap(task => task.materials).every(material => material.deliveryVerified));
  assert.equal(rubricItems.filter((item) => item.points > 1).length, 177);
  assert.ok(rubricItems.every((item) => Number.isInteger(item.points) && item.points >= 1 && item.points <= 6));
  assert.match(catalog, /practical-score-map/);
  assert.match(catalog, /正式实操六模块分值/);
  assert.match(catalog, /二选一/);
  assert.match(workspace, /WordTemplateExercise/);
  assert.match(workspace, /本题满分/);
  assert.match(workspace, /practical-flow-nav/);
  assert.match(workspace, /答案与评分/);
  assert.doesNotMatch(workspace, /RubricAssessment|scorePractical|当前自评分|保存自评并查看答案/);
  assert.doesNotMatch(workspace, /type="checkbox"/);
  assert.match(materials, /本题官方文件/);
  assert.match(materials, /官方素材目录未附独立输入文件/);
  assert.match(materials, /material\.label/);
  assert.match(materials, /官方 Word 原文/);
  assert.match(materials, /document-inline-preview" open/);
  assert.match(materials, /material\.preview\.map/);
  assert.match(materials, /shouldDownload/);
  assert.match(materials, /"notebook", "code", "text"/);
  assert.match(examWorkspace, /exam-word-workspace/);
  assert.match(examWorkspace, /exam-response-workspace/);
  assert.match(examWorkspace, /exam-notebook-review/);
  assert.match(examWorkspace, /在官方模板中完成 5 处填写/);
  assert.match(examWorkspace, /分别完成两份交付物/);
  assert.match(examWorkspace, /复盘代码与运行成果/);
  assert.match(outcomeCheck, /item\.points \+ 1/);
  assert.match(outcomeCheck, /本项给分/);
  assert.match(outcomeCheck, /未核对项明确记 0 分/);
  assert.match(outcomeCheck, /aria-pressed/);
  assert.doesNotMatch(`${workspace}${examWorkspace}${outcomeCheck}${practicalMock}${styles}`, /<aside|practical-exam-nav|practical-score-sidebar|lab-context-drawer|题目与评分|官方评分标准|practical-rubric-workspace|rubric-score-picker|lab-guide-drawer/);
  await assert.rejects(readFile(new URL("../components/RubricAssessment.tsx", import.meta.url), "utf8"));
  await assert.rejects(readFile(new URL("../components/RubricScorePicker.tsx", import.meta.url), "utf8"));
  assert.match(practicalStorage, /ai-trainer-practical-mock-v4/);
  assert.match(practicalMock, /PracticalExamTaskWorkspace/);
  assert.match(practicalMock, /practical-exam-task-strip/);
  assert.match(practicalMock, /activeTask\.hasNotebook \? <><PracticalExamTaskWorkspace/);
  assert.match(practicalMock, /phase="review"/);
  assert.match(practicalApi, /scorePractical/);
  assert.match(practicalApi, /JSON\.stringify\(scored\.rubric\)/);
  assert.match(scoring, /Number\.isInteger/);
  assert.match(contentRequirements, /python-docx==1\.2\.0/);
  assert.match(contentRequirements, /openpyxl==3\.1\.5/);
});

test("Word template practical tasks use five contextual answer fields instead of the generic scoring panel", async () => {
  const [content, helper, component, workspace, detailPage, styles] = await Promise.all([
    loadContentBank(),
    import(new URL("../lib/practical-word-exercise.ts", import.meta.url)),
    readFile(new URL("../components/WordTemplateExercise.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/practical/[code]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const tasks = content.practical.filter((task) => ["4.1", "4.2"].includes(task.group));
  assert.equal(tasks.length, 10);
  for (const task of tasks) {
    const exercise = helper.createPracticalWordExercise(task);
    assert.ok(exercise, task.code);
    assert.equal(exercise.fields.length, 5, task.code);
    assert.equal(new Set(exercise.fields.map((field) => field.blockIndex)).size, 5, task.code);
    assert.ok(exercise.fields.every((field) => field.label && field.referenceAnswer), task.code);
    assert.deepEqual(task.rubric, [{ id: "M1", points: 5, description: task.rubric[0].description, mode: "self" }]);
    // 参考填写来自实体层的结构化 fills，不再靠扫描 referenceAnswer 里的「填写：」行：
    // 排版一变就什么都扫不到，而扫不到会让整道题的作答界面消失。
    const fills = task.wordAnswer.deliverables[0].fills;
    assert.deepEqual(fills.map((fill) => fill.order), [1, 2, 3, 4, 5], task.code);
    assert.deepEqual(exercise.fields.map((field) => field.referenceAnswer), fills.map((fill) => fill.answer), task.code);
    assert.deepEqual(exercise.fields.map((field) => field.label), fills.map((fill) => fill.label), task.code);
  }
  const officialRetail = helper.createPracticalWordExercise(tasks.find((task) => task.code === "4.2.1"));
  assert.equal(officialRetail.fields[0].referenceAnswer, "会员基本信息、消费记录和积分兑换");
  assert.equal(officialRetail.fields[4].referenceAnswer, "提升业务效率和顾客满意度");
  assert.match(component, /data-word-answer/);
  assert.match(component, /草稿与核分已同步到账号，换设备可继续/);
  assert.match(component, /未达到 · 0 分/);
  assert.match(component, /达到 · 1 分/);
  assert.match(component, /word-inline-field/);
  assert.match(component, /完成填写，核对答案/);
  assert.match(component, /exercise\.materialName/);
  assert.match(component, /修改填写会撤销对应旧分数/);
  // 同 1.2/3.1：原先连 fetch( 一起禁掉等于把「只存本机」写成契约，而界面承诺草稿会
  // 保存。现在允许同步草稿，仍禁止任何官方判分与成绩上报。
  assert.doesNotMatch(component, /scorePractical|rubric:|保存成绩|自评分/);
  assert.match(component, /fetch\(`\/api\/drafts\/\$\{task\.code\}`/);
  assert.match(workspace, /word-answer-first/);
  assert.match(component, /PracticalTaskHeader/);
  assert.match(component, /PracticalBrief/);
  assert.match(component, /PracticalMaterialsList/);
  assert.match(component, /business-answer-sheet word-answer-sheet word-template-exercise word-template-answer-sheet/);
  assert.match(component, /business-sheet-paper word-document-canvas/);
  assert.match(component, /business-sheet-section word-template-sheet-section/);
  assert.doesNotMatch(component, /sourceDocument/);
  assert.doesNotMatch(workspace, /showDocumentPreview=\{false\}/);
  assert.doesNotMatch(workspace, /practical-rubric-workspace|RubricAssessment/);
  assert.match(detailPage, /wordTemplateTask = task\.group === "4\.1" \|\| task\.group === "4\.2"/);
  assert.match(detailPage, /word-template-detail-page/);
  assert.match(detailPage, /userEmail=\{user\?\.email \?\? null\}/);
  assert.match(styles, /\.word-fill-slot/);
  assert.match(styles, /\.word-exercise-document/);
  assert.match(styles, /\.word-template-answer-sheet \.word-template-sheet-section/);
});

test("two-deliverable Word tasks share the 1.2 paper answer sheet and completion checks", async () => {
  const [content, helper, answers, component, workspace, styles] = await Promise.all([
    loadContentBank(),
    import(new URL("../lib/practical-response-exercise.ts", import.meta.url)),
    import(new URL("../lib/practical-word-answer.ts", import.meta.url)),
    readFile(new URL("../components/BusinessAnalysisAnswerSheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const tasks = content.practical.filter((task) => ["1.2", "3.1"].includes(task.group));
  assert.equal(tasks.length, 10);
  for (const task of tasks) {
    const exercise = helper.createPracticalResponseExercise(task);
    assert.ok(exercise, task.code);
    assert.equal(exercise.sections.length, 2, task.code);
    assert.deepEqual(exercise.sections.map((section) => section.id), ["deliverable-1", "deliverable-2"]);
    assert.ok(exercise.sections.every((section) => section.prompt && section.outputLabel), task.code);
    // 两问的参考答案来自结构化交付物，不再在 referenceAnswer 里按标记现切。
    for (const section of exercise.sections) {
      assert.ok(section.reference.length, `${task.code} 第 ${section.number} 问没有参考答案`);
      assert.ok(section.reference.every((block) => block.heading.trim() && block.lines.length && block.lines.every((line) => line.trim())), `${task.code} 第 ${section.number} 问的参考答案有空块`);
    }
    // 官方答案的每一块都必须落到某一问里——切分错位最典型的后果就是「少了一段」。
    assert.equal(exercise.sections.flatMap((section) => section.reference).length, answers.practicalWordAnswerBlocks(task).length, task.code);
    assert.deepEqual(exercise.sections.flatMap((section) => section.rubric.map((item) => item.id)), task.rubric.map((item) => item.id), task.code);
    assert.equal(helper.createPracticalResponseExercise({ ...task, hasNotebook: true }), null);
  }
  assert.match(component, /business-answer-sheet word-answer-sheet/);
  assert.match(component, /business-sheet-paper/);
  assert.match(component, /business-sheet-section/);
  assert.match(component, /PracticalOutcomeCheck/);
  assert.match(component, /已完成本题全部复盘检查/);
  assert.match(component, /修改作答会撤销对应的旧自评分/);
  // 草稿键不再带参考答案指纹，旧键迁移也随之去掉：那些键的后缀里嵌着
  // referenceAnswer.length，答案结构化后必然对不上，而权威副本本来就在账号里。
  assert.doesNotMatch(component, /storageVersion|ai-trainer-business-answer-sheet-v1|ai-trainer-practical-response-v3/);
  assert.match(component, /ai-trainer-business-answer-sheet-v2/);
  assert.match(component, /business-sheet-sidebar/);
  assert.match(component, /PracticalBrief task=\{task\} open=\{false\}/);
  // 原先这里连 fetch( 一起禁掉，等于把「答题纸只存本机」固化成契约；但界面承诺草稿会
  // 保存，只写 localStorage 换设备就丢。现在允许同步草稿，仍禁止任何官方判分。
  assert.doesNotMatch(component, /scorePractical|RubricAssessment/);
  assert.match(component, /fetch\(`\/api\/drafts\/\$\{task\.code\}`/);
  assert.match(component, /answerSheet: \{ version: 1, answers, scores \}/);
  assert.match(workspace, /const reportAnswerSheet = task\.group === "1\.2" \|\| task\.group === "3\.1"/);
  assert.match(workspace, /if \(reportAnswerSheet\) return <BusinessAnalysisAnswerSheet/);
  assert.doesNotMatch(workspace, /PracticalResponseExercise/);
  assert.match(styles, /\.business-sheet-section/);
  assert.match(styles, /\.business-sheet-review/);
});

test("Notebook Word answer sheets appear only where the official task requires a Word document", async () => {
  const [content, helper, references, component, styles] = await Promise.all([
    loadContentBank(),
    import(new URL("../lib/practical-word-deliverable.ts", import.meta.url)),
    import(new URL("../lib/practical-word-answer.ts", import.meta.url)),
    readFile(new URL("../components/PracticalWordDeliverable.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const notebookTasks = content.practical.filter((task) => task.hasNotebook);
  const wordTasks = notebookTasks.filter((task) => ["2.1", "2.2", "3.2"].includes(task.group));
  assert.equal(wordTasks.length, 15);
  assert.equal(notebookTasks.filter((task) => task.group === "1.1").length, 5);
  for (const task of wordTasks) {
    const deliverable = helper.getPracticalWordDeliverable(task);
    assert.ok(deliverable, task.code);
    assert.equal(deliverable.fileName, `${task.code}.docx`);
    assert.ok(deliverable.requirement.includes(deliverable.fileName));
  }
  for (const task of notebookTasks.filter((task) => task.group === "1.1")) assert.equal(helper.getPracticalWordDeliverable(task), null, task.code);
  const reportReference = JSON.stringify(references.practicalWordAnswerBlocks(content.practical.find((task) => task.code === "2.2.1")));
  assert.match(reportReference, /模型性能/);
  assert.doesNotMatch(reportReference, /import pandas/);
  assert.doesNotMatch(component, /独立文字交付物，不写入 Notebook/);
  assert.doesNotMatch(component, /其他结果文件仍在 Notebook 中完成/);
  assert.match(component, /business-sheet-paper notebook-word-answer-sheet/);
  assert.match(component, /business-sheet-section notebook-word-sheet-section/);
  assert.match(component, /完成作答，进入复盘/);
  assert.match(component, /practicalWordAnswerBlocks|getPracticalWordAnswer/);
  assert.doesNotMatch(component, /referenceAnswer\.(indexOf|slice|match|split)/);
  assert.doesNotMatch(component, /type="file"|截图上传|HTML 上传/);
  assert.match(styles, /\.notebook-word-answer-sheet/);
});

test("business-optimization tasks start with the official two-question blank answer sheet", async () => {
  const [content, helper, component, workspace, detailPage, brief, styles] = await Promise.all([
    loadContentBank(),
    import(new URL("../lib/practical-response-exercise.ts", import.meta.url)),
    readFile(new URL("../components/BusinessAnalysisAnswerSheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/practical/[code]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalBrief.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const tasks = content.practical.filter((task) => task.group === "1.2");
  assert.equal(tasks.length, 5);
  for (const task of tasks) {
    const exercise = helper.createPracticalResponseExercise(task);
    assert.ok(exercise, task.code);
    assert.equal(exercise.sections.length, 2, task.code);
    assert.ok(task.officialTaskSheet.equipmentRequirements, task.code);
    assert.ok(task.officialTaskSheet.skillRequirements, task.code);
    assert.ok(task.officialTaskSheet.qualityIndicators, task.code);
  }
  assert.match(workspace, /BusinessAnalysisAnswerSheet/);
  assert.match(workspace, /task\.group === "1\.2" \|\| task\.group === "3\.1"/);
  assert.match(workspace, /if \(reportAnswerSheet\) return <BusinessAnalysisAnswerSheet/);
  assert.match(component, /PracticalTaskHeader/);
  assert.match(component, /PracticalBrief task=\{task\} open=\{false\}/);
  assert.match(component, /PracticalMaterialsList/);
  assert.match(component, /role="document"/);
  assert.match(component, /aria-label=\{`\$\{task\.code\} 答题卷`\}/);
  assert.match(brief, /查看完整官方题目/);
  assert.match(brief, /task\.description/);
  assert.match(brief, /场地设备要求/);
  assert.match(brief, /技能要求/);
  assert.match(brief, /质量指标/);
  assert.match(component, /完成作答，进入复盘/);
  assert.match(component, /非官方考场信息/);
  assert.doesNotMatch(component, /官方评分项/);
  assert.match(detailPage, /business-answer-sheet-page/);
  assert.match(detailPage, /reportAnswerSheetTask = task\.group === "1\.2" \|\| task\.group === "3\.1"/);
  assert.match(styles, /\.business-answer-sheet \{/);
  assert.match(styles, /\.business-sheet-paper/);
  assert.doesNotMatch(styles, /\.business-sheet-context/);
  assert.match(styles, /\.business-sheet-sidebar/);
});

test("practical rubric scoring preserves partial points and rejects invalid values", async () => {
  const { scorePractical } = await import(new URL("../lib/scoring.ts", import.meta.url));
  const task = { maxScore: 6, rubric: [{ id: "M1", points: 3 }, { id: "M2", points: 3 }] };
  assert.deepEqual(scorePractical(task, { M1: 2, M2: 1 }), { score: 3, maxScore: 6, rubric: { M1: 2, M2: 1 } });
  assert.deepEqual(scorePractical(task, { M1: 99, M2: 2 }), { score: 5, maxScore: 6, rubric: { M1: 3, M2: 2 } });
  assert.deepEqual(scorePractical(task, { M1: 1.5, M2: 2 }), { score: 2, maxScore: 6, rubric: { M1: 0, M2: 2 } });
  assert.deepEqual(scorePractical(task, { M1: true, M2: false }), { score: 0, maxScore: 6, rubric: { M1: 0, M2: 0 } });
});

test("historical theory references remain hash-bound without changing official answers", async () => {
  const [content, reference, editorial, audit, importer, validator, practice] = await Promise.all([
    loadContentBank(),
    readFile(new URL("../data/references/theory-question-bank-2026-07-16.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/references/theory-editorial-review-2026-07-17.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/references/theory-reference-audit.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../scripts/import-reference.py", import.meta.url), "utf8"),
    readFile(new URL("../scripts/validate-content.py", import.meta.url), "utf8"),
    readFile(new URL("../components/TheoryPractice.tsx", import.meta.url), "utf8"),
  ]);
  const basisCounts = Object.groupBy(content.theory, (question) => question.answerBasis);
  assert.equal(reference.questions.length, 900);
  assert.equal(reference.sourceSha256, "4c0fa4ac6accc6ab335a54f3fe5a04c56485aeeae4dfd46761de960abd6512c8");
  assert.equal(basisCounts.manual_official.length, 190);
  assert.equal(basisCounts.third_party_reference.length, 571);
  assert.equal(basisCounts.editorial_review.length, 139);
  assert.equal(basisCounts.heuristic, undefined);
  assert.equal(editorial.version, "2026-07-17-v3");
  assert.equal(editorial.reviews.length, 23);
  assert.ok(editorial.reviews.every(item => /^[0-9a-f]{64}$/.test(item.questionSha256)));
  assert.deepEqual(audit.summary, {
    strictMatches: 830,
    appliedDerivedAnswers: 649,
    unmatchedDerivedAnswers: 61,
    preservedOfficialAnswers: 190,
    strictMatchedOfficialAnswers: 181,
    unmatchedOfficialAnswers: 9,
    strictOfficialDifferences: 5,
    appliedEditorialReviews: 23,
    remainingHeuristicAnswers: 38,
  });
  assert.equal(audit.editorialReview.appliedReviews, 23);
  assert.equal(audit.version, "2026-07-19-v7");
  assert.equal(audit.officialAnswersSha256, "2e4bef5183e8fbf66f152006d70bb5843a60f5b519d321f3a54d06eab61e829f");
  assert.match(importer, /apply_reference_answers/);
  assert.match(importer, /apply_editorial_reviews/);
  assert.match(validator, /strict_match/);
  assert.match(validator, /question_fingerprint/);
  assert.doesNotMatch(practice, /公开参考题库|本站逐题复核|matchesAnswerFilter|SOURCE_OPTIONS/);
  assert.deepEqual(content.theory.find((question) => question.id === "judge-197").answer, ["√"]);
  assert.deepEqual(content.theory.find((question) => question.id === "judge-216").answer, ["×"]);
  assert.deepEqual(content.theory.find((question) => question.id === "judge-226").answer, ["√"]);
  assert.deepEqual(content.theory.find((question) => question.id === "judge-235").answer, ["×"]);
  assert.deepEqual(content.theory.find((question) => question.id === "judge-243").answer, ["×"]);
});

test("published theory review is complete, independently cross-reviewed, and audit-bound", async () => {
  const [content, reviewAudit, reviewManifestText, validator] = await Promise.all([
    loadContentBank(),
    readFile(new URL("../data/references/theory-review-audit.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/references/theory-review-state/manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/validate-content.py", import.meta.url), "utf8"),
  ]);
  const reviewManifest = JSON.parse(reviewManifestText);
  assert.equal(content.version, "2026-07-28-v9");
  assert.deepEqual(content.theoryReview.basisCounts, {
    independent_review: 139,
    official_word: 190,
    secondary_site: 571,
  });
  assert.equal(content.theoryReview.reviewedQuestions, 900);
  assert.equal(content.theoryReview.independentExplanations, 900);
  assert.equal(content.theoryReview.crossReviewedQuestions, 900);
  assert.equal(content.theoryReview.crossReviewShards, 9);
  assert.equal(content.theoryReview.answerChanges, 79);
  assert.equal(content.theoryReview.officialAnswerChanges, 0);
  assert.equal(content.theoryReview.resolvedConflicts, 5);
  assert.equal(content.theoryReference.appliedDerivedAnswers, 649);
  assert.equal(content.theoryReference.unmatchedDerivedAnswers, 61);
  assert.equal(content.theoryReference.remainingHeuristicAnswers, 0);
  assert.equal(reviewAudit.answerChanges.count, 79);
  assert.equal(reviewAudit.answerChanges.officialAnswerChanges, 0);
  assert.equal(reviewAudit.conflicts.open, 0);
  assert.equal(reviewAudit.conflicts.resolved, 5);
  assert.equal(reviewAudit.explanations.total, 900);
  assert.equal(reviewAudit.explanations.crossReviewed, 900);
  assert.deepEqual(reviewAudit.explanations.duplicateGroups, []);
  assert.deepEqual(reviewAudit.explanations.warnings, []);
  assert.equal(
    content.theoryReview.manifestSha256,
    createHash("sha256").update(reviewManifestText).digest("hex"),
  );
  assert.deepEqual(reviewManifest.summary.byExplanationGenerationStatus, { reviewed: 900 });
  const qaBatches = reviewManifest.appliedBatches.filter((batch) => batch.reviewStage === "qa");
  assert.equal(qaBatches.length, 9);
  assert.equal(new Set(qaBatches.map((batch) => batch.shardId)).size, 9);
  for (const qaBatch of qaBatches) {
    const generationBatch = reviewManifest.appliedBatches.find(
      (batch) => batch.shardId === qaBatch.shardId && batch.reviewStage === "generation",
    );
    assert.ok(generationBatch);
    assert.equal(qaBatch.count, 100);
    assert.equal(
      qaBatch.reviewers.some((reviewer) => generationBatch.reviewers.includes(reviewer)),
      false,
    );
  }
  assert.equal(new Set(content.theory.map((question) => question.explanation)).size, 900);
  assert.ok(content.theory.every((question) => question.explanation.trim().length >= 24));
  assert.match(validator, /build_theory_review_quality_report/);
});

test("user-facing study surfaces omit answer provenance while audit metadata remains internal", async () => {
  const paths = [
    "../components/TheoryPractice.tsx",
    "../components/TheoryMock.tsx",
    "../components/PracticalCatalog.tsx",
    "../components/PracticalWorkspace.tsx",
    "../components/PracticalExamTaskWorkspace.tsx",
    "../components/PracticalWordDeliverable.tsx",
    "../components/WordTemplateExercise.tsx",
    "../components/BusinessAnalysisAnswerSheet.tsx",
    "../components/ProgressDashboard.tsx",
    "../app/page.tsx",
    "../app/layout.tsx",
  ];
  const surfaces = (await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")))).join("\n");
  const practicalMock = await readFile(new URL("../components/PracticalMock.tsx", import.meta.url), "utf8");
  assert.match(practicalMock, /PracticalExamTaskWorkspace/);
  assert.doesNotMatch(surfaces, /SourceBadge|PracticalSourceNote|答案来源|参考依据|公开参考题库|本站逐题复核|本站知识点整理|可信度|官方答案|标准答案|官方卷|官方模拟卷|内容哈希|内容指纹/);
  await assert.rejects(readFile(new URL("../components/SourceBadge.tsx", import.meta.url), "utf8"), { code: "ENOENT" });
});

test("official Word templates expose hash-bound fill examples for every blank", async () => {
  const [content, snapshot, importer, validator] = await Promise.all([
    loadContentBank(),
    readFile(new URL("../data/references/practical-template-answers-2026-07-17.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../scripts/import-reference.py", import.meta.url), "utf8"),
    readFile(new URL("../scripts/validate-content.py", import.meta.url), "utf8"),
  ]);
  assert.deepEqual(content.practicalTemplateReferences, {
    snapshotVersion: "2026-07-27-v2",
    capturedAt: "2026-07-27",
    reviewMethod: "official_docx_blank_slots",
    reviewedTasks: 9,
    filledBlankSlots: 45,
  });
  assert.equal(snapshot.answers.length, 9);
  assert.equal(snapshot.answers.flatMap((entry) => entry.fills).length, 45);
  const byCode = new Map(content.practical.map((task) => [task.code, task]));
  for (const entry of snapshot.answers) {
    const task = byCode.get(entry.code);
    assert.equal(task.answerSource, "derived", entry.code);
    assert.equal(task.answerBasis, "official_template_completion", entry.code);
    assert.equal(entry.fills.length, entry.template.blankCount, entry.code);
    // 填写示例已从 referenceAnswer 搬进结构化的 wordAnswer.fills（2026-07-28 官方参考
    // 快照），referenceAnswer 因此清空；这里守的是「每个空白都有示例、且与模板空位一一
    // 对应」，而不是某一版把它们拼成什么样的字符串。
    assert.equal(task.referenceAnswer, "", entry.code);
    const fills = task.wordAnswer.deliverables[0].fills;
    assert.equal(fills.length, entry.template.blankCount, entry.code);
    assert.ok(fills.every((fill) => fill.answer.trim() && fill.label.trim()), entry.code);
    const material = task.materials.find((item) => item.name === entry.template.name);
    assert.equal(material.kind, "document", entry.code);
    assert.equal(material.sha256, entry.template.sha256, entry.code);
    const published = await readFile(new URL(`../public/materials/${entry.code}/${entry.template.name}`, import.meta.url));
    assert.equal(createHash("sha256").update(published).digest("hex"), entry.template.sha256, entry.code);
  }
  assert.match(importer, /apply_template_answers/);
  assert.match(validator, /template_blank_slots/);
});

test("material-free business optimization tasks expose complete rubric-bound examples", async () => {
  const [content, snapshot, importer, validator] = await Promise.all([
    loadContentBank(),
    readFile(new URL("../data/references/practical-rubric-answers-2026-07-17.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../scripts/import-reference.py", import.meta.url), "utf8"),
    readFile(new URL("../scripts/validate-content.py", import.meta.url), "utf8"),
  ]);
  assert.deepEqual(content.practicalRubricReferences, {
    snapshotVersion: "2026-07-27-v2",
    capturedAt: "2026-07-27",
    reviewMethod: "official_task_and_rubric_editorial",
    reviewedTasks: 5,
    coveredRubricItems: 26,
  });
  assert.equal(snapshot.answers.length, 5);
  assert.equal(snapshot.answers.flatMap((entry) => Object.keys(entry.rubricCoverage)).length, 26);
  const byCode = new Map(content.practical.map((task) => [task.code, task]));
  for (const entry of snapshot.answers) {
    const task = byCode.get(entry.code);
    assert.equal(task.answerSource, "derived", entry.code);
    assert.equal(task.answerBasis, "official_task_rubric_example", entry.code);
    assert.equal(task.materials.length, 0, entry.code);
    assert.deepEqual(new Set(Object.keys(entry.rubricCoverage)), new Set(task.rubric.map((item) => item.id)), entry.code);
    // 这批 1.2 的作答示例已由 2026-07-28 官方参考快照取代，改存结构化的 wordAnswer，
    // referenceAnswer 因此清空。评分点覆盖仍由上面的 rubricCoverage 守着；示例本身
    // 守的是「两问都有内容、每条都不为空」。
    assert.equal(task.referenceAnswer, "", entry.code);
    const sections = task.wordAnswer.deliverables[0].sections;
    assert.deepEqual([...new Set(sections.map((section) => section.part))].sort(), [1, 2], entry.code);
    assert.ok(sections.every((section) => section.heading.trim() && section.items.every((item) => item.trim())), entry.code);
  }
  assert.match(importer, /apply_rubric_answers/);
  assert.match(validator, /rubricCoverage/);
});

test("all Python practical tasks expose audited completed-notebook reference code", async () => {
  const [content, snapshot, audit, importer, lab, bridgeExtension] = await Promise.all([
    loadContentBank(),
    readFile(new URL("../data/references/notebook-solutions-2026-07-16.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/references/notebook-solution-audit.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../scripts/import-reference.py", import.meta.url), "utf8"),
    readFile(new URL("../components/JupyterLiteLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../jupyterlite-extension/src/index.ts", import.meta.url), "utf8"),
  ]);
  const tasks = content.practical.filter(task => task.hasNotebook);
  assert.equal(content.version, "2026-07-28-v9");
  assert.equal(tasks.length, 20);
  assert.equal(snapshot.solutions.length, 20);
  assert.deepEqual(audit.summary, {
    notebookSolutions: 20,
    derivedNotebookSolutions: 16,
    officialNotebookSolutions: 4,
    solutionCodeCells: 33,
    solutionsWithBlanks: 0,
  });
  for (const task of tasks) {
    assert.equal(task.notebook.solutionSource, "completed_reference_notebook");
    assert.ok(task.notebook.solutionCells.length > 0);
    const source = task.notebook.solutionCells.map(cell => cell.source).join("\n");
    assert.doesNotMatch(source, /___+/);
    assert.equal(createHash("sha256").update(source).digest("hex"), task.notebook.solutionSha256);
  }
  assert.match(importer, /apply_notebook_solutions/);
  assert.match(lab, /buildFillReferences/);
  assert.match(lab, /ai-trainer:set-fill-review/);
  assert.match(bridgeExtension, /参考填写/);
  assert.match(bridgeExtension, /classifyFill/);
  assert.match(bridgeExtension, /完全一致/);
  assert.match(bridgeExtension, /与参考不同/);
  assert.match(bridgeExtension, /填入参考/);
  // 实验室里靠 display:none 隐藏的基础设施单元不能跟着导出：ai-trainer-onnx 是
  // onnxruntime 的浏览器垫片，学员把 .ipynb 拿到本地真实 Python 里跑时需要的是真的
  // onnxruntime，垫片反而会顶掉它。导出的应当只有考试本身的代码。
  assert.match(lab, /withoutInfrastructureCells\(await readNotebook\(\)\)/);
  assert.match(lab, /INFRASTRUCTURE_CELL_TAGS = new Set\(\["ai-trainer-setup", "ai-trainer-onnx"\]\)/);
  assert.doesNotMatch(lab, /下载完整参考代码|SourceBadge/);
});

test("每题素材有清单兜底，跨域隔离失效时也能读到数据文件", async () => {
  const [content, labManifest, bridgeExtension] = await Promise.all([
    loadContentBank(),
    readFile(new URL("../public/labs/manifest.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../jupyterlite-extension/src/index.ts", import.meta.url), "utf8"),
  ]);
  // mountDrive 在内核创建那一刻定死：跨域隔离未成立时没有 /drive，学员会在自己的
  // 代码里撞上 FileNotFoundError。扩展据 ai_trainer.assets 校验并按需补齐，所以清单
  // 必须与官方素材清单逐项对齐，且带 sha256 供校验。
  assert.match(bridgeExtension, /pyfetch/);
  assert.match(bridgeExtension, /hashlib\.sha256/);
  for (const task of content.practical.filter(item => item.hasNotebook)) {
    const workspaceDir = task.code.replaceAll(".", "-");
    const notebook = JSON.parse(
      await readFile(new URL(`../public/lite/files/${workspaceDir}/${task.code}.ipynb`, import.meta.url), "utf8"),
    );
    const assets = notebook.metadata.ai_trainer.assets;
    assert.ok(Array.isArray(assets), `${task.code} 缺少 assets 元数据`);
    const expected = labManifest.tasks[task.code]?.assets ?? [];
    assert.deepEqual(
      assets.map(asset => asset.name).sort(),
      expected.map(asset => asset.name).sort(),
      `${task.code} 的素材清单与 labs/manifest.json 不一致`,
    );
    for (const asset of assets) {
      assert.match(asset.sha256, /^[0-9a-f]{64}$/, `${task.code} 素材缺少 sha256`);
      assert.match(asset.url, /^\/labs\//, `${task.code} 素材 URL 必须是站内 /labs/ 路径`);
    }
  }
});

test("官方考题用到的 Pillow 9 别名由准备阶段补回，题目源码不被改写", async () => {
  const [content, bridgeExtension, pyodideLock] = await Promise.all([
    loadContentBank(),
    readFile(new URL("../jupyterlite-extension/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/lite/static/pyodide/pyodide-lock.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  // Pillow 10.0 删掉了 ANTIALIAS/LINEAR/CUBIC 这批 9.1 起弃用的常量别名，而站点自带
  // 的 Pyodide 只提供 Pillow 10.2.0——降版本这条路不存在：PyPI 上 Pillow 没有任何
  // wasm32 wheel，piplite 装不了 9.x。所以官方代码继续原样保留，别名在准备阶段补回。
  const pillowMajor = Number(pyodideLock.packages.pillow.version.split(".")[0]);
  assert.ok(pillowMajor >= 10, "Pillow 已低于 10，应重新评估这层兼容垫片是否还需要");

  const users = content.practical.filter(task => task.hasNotebook
    && (task.notebook.cells ?? []).some(cell => cell.source.includes("Image.ANTIALIAS")));
  assert.deepEqual(users.map(task => task.code), ["3.2.3"]);
  for (const task of users) {
    const workspaceDir = task.code.replaceAll(".", "-");
    const notebook = JSON.parse(
      await readFile(new URL(`../public/lite/files/${workspaceDir}/${task.code}.ipynb`, import.meta.url), "utf8"),
    );
    // 发布出去的 notebook 必须与实体层逐字一致：修复不允许落在题目文件里。
    assert.ok(
      notebook.cells.some(cell => cell.source.join("").includes("Image.ANTIALIAS")),
      `${task.code} 的官方代码被改写了`,
    );
  }
  assert.match(bridgeExtension, /preloadImports\.includes\("PIL"\)/);
  assert.match(bridgeExtension, /_PILImage\.ANTIALIAS = _PILImage\.Resampling\.LANCZOS/);
});

test("Word deliverable answers never expose Python code to learners", async () => {
  const [content, answers] = await Promise.all([
    loadContentBank(),
    import(new URL("../lib/practical-word-answer.ts", import.meta.url)),
  ]);
  // 学员在 Word 题点「查看答案」时，只该看到 Word 作答内容：不含 Python 代码，也不
  // 该先糊一段评分点列表（那里绝大多数是代码得分点，由 Notebook 判分）。Word 答案现在
  // 是独立字段而不是从 referenceAnswer 里切出来的一段，所以这条从「切得对不对」变成
  // 「这个字段里本来就不该有代码」——同时守住反向的一条：Word 正文不能还留在
  // referenceAnswer 里两头都有，否则页面上同一份答案会出现两遍。
  const codeMarkers = /(?:^|\n)\s*(?:import |from \w+ import |def |print\()/;
  const wordTasks = content.practical.filter(
    task => task.notebook?.solutionCells?.length
      && task.description.toLowerCase().includes(`${task.code}.docx`.toLowerCase()),
  );
  assert.equal(wordTasks.length, 15);
  for (const task of wordTasks) {
    const blocks = answers.practicalWordAnswerBlocks(task);
    assert.ok(blocks.length, `${task.code} 的 Word 参考答案为空`);
    const text = blocks.map((block) => [block.heading, ...block.lines].join("\n")).join("\n");
    assert.doesNotMatch(text, codeMarkers, `${task.code} 的 Word 参考答案仍含 Python 代码`);
    assert.doesNotMatch(text, /建议答案应完整覆盖以下评分点/, `${task.code} 的 Word 参考答案混入了评分点列表`);
    assert.doesNotMatch(text, /Python 参考代码：/, `${task.code} 的 Word 参考答案带上了代码说明尾巴`);
    for (const line of text.split("\n")) {
      if (line.trim().length < 12) continue;
      assert.ok(!task.referenceAnswer.includes(line.trim()), `${task.code} 的 Word 正文同时留在 referenceAnswer 里`);
    }
  }
  // 纯文档题（1.2/3.1/4.x）整段都是 Word 答案，剥完应当为空。
  const documentTasks = content.practical.filter((task) => !task.hasNotebook && task.wordAnswer);
  assert.equal(documentTasks.length, 20);
  for (const task of documentTasks) assert.equal(task.referenceAnswer, "", task.code);
});

test("official practical answers stop at their Word answer boundary", async () => {
  const [content, importer] = await Promise.all([
    loadContentBank(),
    readFile(new URL("../scripts/import-reference.py", import.meta.url), "utf8"),
  ]);
  const official = content.practical.filter(task => task.answerSource === "official");
  assert.equal(official.length, 6);
  for (const task of official) {
    // 官方答案现在分两处落地：Notebook 题的代码留在 referenceAnswer，Word 正文在
    // wordAnswer。纯文档题（3.1.1/4.2.1）整段都是 Word 正文，referenceAnswer 因此为空
    // ——这里守的是「两处合起来不为空」，而不是某一处必须有内容。
    assert.ok(task.referenceAnswer.trim() || task.wordAnswer?.deliverables?.length, task.code);
    assert.doesNotMatch(JSON.stringify(task.wordAnswer ?? null), /人工智能训练师（三级）操作技能考核|试题单|试题代码：|试题名称：/, task.code);
    assert.doesNotMatch(task.referenceAnswer, /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/, task.code);
    assert.doesNotMatch(task.referenceAnswer, /人工智能训练师（三级）操作技能考核|试题单|试题代码：|试题名称：/, task.code);
  }
  assert.match(importer, /clean_official_practical_answer/);
  assert.match(importer, /Missing official practical answer/);
});

test("theory exam entry exposes its start controls from a compact workspace", async () => {
  const [theoryPage, theoryMock] = await Promise.all([
    readFile(new URL("../app/theory/mock/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/TheoryMock.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(theoryPage, /mock-page-head/);
  assert.doesNotMatch(theoryPage, /page-hero/);
  assert.match(theoryMock, /container mock-entry/);
});

test("official exam blueprint is centralized and both mock exams use persistent deadline-based sessions", async () => {
  const [blueprint, theoryMock, practicalMock, theoryApi, scoring, lab, workbench, theoryStorage, practicalStorage] = await Promise.all([
    readFile(new URL("../lib/exam-blueprint.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/TheoryMock.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalMock.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/theory/attempt/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/scoring.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/JupyterLiteLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalLabWorkbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/theory-exam-storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/practical-exam-storage.ts", import.meta.url), "utf8"),
  ]);
  assert.match(blueprint, /durationMinutes: 90/);
  assert.match(blueprint, /totalQuestions: 190/);
  assert.match(blueprint, /judge: \{ label: "判断题", count: 40, points: 0\.5 \}/);
  assert.match(blueprint, /single: \{ label: "单选题", count: 140, points: 0\.5 \}/);
  assert.match(blueprint, /multi: \{ label: "多选题", count: 10, points: 1 \}/);
  assert.match(blueprint, /durationMinutes: 120/);
  assert.match(blueprint, /maxScore: 25/);
  assert.match(blueprint, /maxScore: 15/);
  assert.match(blueprint, /maxScore: 20/);
  assert.match(theoryStorage, /ai-trainer-theory-mock-v2/);
  assert.match(theoryMock, /createFinishedTheoryExamSnapshot/);
  assert.match(theoryMock, /restoreTheoryExamSnapshot/);
  assert.match(theoryMock, /deadlineAt - Date\.now\(\)/);
  assert.match(theoryMock, /answersRef\.current/);
  assert.match(theoryMock, /autoSubmitAttemptedRef/);
  assert.match(theoryMock, /wrongQuestionIds/);
  assert.match(theoryMock, /theory-mock-layout/);
  assert.match(theoryMock, /theory-mock-answer-sheet/);
  assert.match(theoryMock, /下一未答/);
  assert.match(theoryMock, /navigatorFilter/);
  assert.doesNotMatch(theoryMock, /className="mock-navigator"/);
  assert.match(practicalStorage, /ai-trainer-practical-mock-v4/);
  assert.match(practicalMock, /createPracticalExamSnapshot/);
  assert.match(practicalMock, /restorePracticalExamSnapshot/);
  assert.match(practicalMock, /practical-exam-layout/);
  assert.match(practicalStorage, /taskCodes/);
  assert.match(practicalMock, /examMode/);
  assert.match(practicalMock, /生成并保存成绩/);
  assert.match(practicalMock, /PracticalExamTaskWorkspace/);
  assert.match(theoryApi, /examBlueprint\.theory\.totalQuestions/);
  assert.match(scoring, /unansweredQuestionIds/);
  assert.match(scoring, /byType/);
  assert.match(lab, /if \(examMode \|\| fillReferences\.length === 0\) return/);
  assert.match(lab, /ai-trainer:set-fill-review/);
  assert.match(workbench, /lab-workspace-switcher/);
  assert.doesNotMatch(workbench, /activeSurface === "review"|代码填空核对/);
  assert.doesNotMatch(lab, /loadCodeReview|lab-fill-review/);
  assert.doesNotMatch(lab, /PracticalOutcomeCheck/);
  assert.doesNotMatch(lab, /setOpenPanel|openPanel/);
  assert.doesNotMatch(lab, /题目与评分|官方评分标准|lab-rubric-|rubric-display-list/);
});

test("theory mock review paginates the 189-unanswered edge case and separates statuses", async () => {
  const [{ getTheoryReviewPage, THEORY_REVIEW_PAGE_SIZE }, mock, styles] = await Promise.all([
    import(new URL("../lib/theory-review.ts", import.meta.url)),
    readFile(new URL("../components/TheoryMock.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const unanswered = Array.from({ length: 189 }, (_, index) => `q-${index + 1}`);
  const first = getTheoryReviewPage([], unanswered, "all", 0);
  assert.equal(THEORY_REVIEW_PAGE_SIZE, 20);
  assert.equal(first.visibleIds.length, 20);
  assert.equal(first.pageCount, 10);
  assert.deepEqual([first.start, first.end], [1, 20]);
  const last = getTheoryReviewPage([], unanswered, "unanswered", 99);
  assert.equal(last.page, 9);
  assert.equal(last.visibleIds.length, 9);
  assert.deepEqual([last.start, last.end], [181, 189]);
  const wrongOnly = getTheoryReviewPage(["wrong-1", "wrong-2"], ["wrong-1", "open-1"], "wrong", 0);
  assert.deepEqual(wrongOnly.visibleIds, ["wrong-1", "wrong-2"]);
  assert.deepEqual(getTheoryReviewPage([], unanswered, "wrong", 0).visibleIds, []);
  assert.match(mock, /筛选复盘题目/);
  assert.match(mock, /review\.visibleIds\.map/);
  assert.doesNotMatch(mock, /reviewIds\.map/);
  assert.match(mock, /复盘分页/);
  assert.match(styles, /mock-review-filters/);
  assert.match(styles, /mock-review-pager/);
});

test("completed theory mock snapshots survive refresh and reject stale or forged results", async () => {
  const [content, storage, scoring, mock, page] = await Promise.all([
    loadContentBank(),
    import(new URL("../lib/theory-exam-storage.ts", import.meta.url)),
    import(new URL("../lib/scoring.ts", import.meta.url)),
    readFile(new URL("../components/TheoryMock.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/theory/mock/page.tsx", import.meta.url), "utf8"),
  ]);
  const byId = new Map(content.theory.map((question) => [question.id, question]));
  const questions = content.officialTheoryMock.questionIds.map((id) => byId.get(id));
  const answers = { [questions[0].id]: questions[0].answer };
  const result = scoring.scoreTheory(questions, answers);
  const completed = storage.createFinishedTheoryExamSnapshot({
    contentVersion: content.version,
    mode: "official",
    questions,
    answers,
    current: 0,
    deadlineAt: Date.now() + 1000,
    completedAt: 123456,
    result,
  });
  const restored = storage.restoreTheoryExamSnapshot(JSON.stringify(completed), content.theory, content.version);
  assert.equal(restored.snapshot.phase, "finished");
  assert.deepEqual(restored.answers, answers);
  assert.deepEqual(restored.result, result);
  assert.equal(restored.result.unansweredQuestionIds.length, 189);
  assert.equal(storage.restoreTheoryExamSnapshot(JSON.stringify(completed), content.theory, "stale-content"), null);
  const forged = structuredClone(completed);
  forged.result.score += 50;
  assert.equal(storage.restoreTheoryExamSnapshot(JSON.stringify(forged), content.theory, content.version), null);
  const malformed = structuredClone(completed);
  malformed.questionIds[0] = "unknown-question";
  assert.equal(storage.restoreTheoryExamSnapshot(JSON.stringify(malformed), content.theory, content.version), null);
  assert.match(mock, /本次交卷结果保存在当前浏览器，刷新后仍可继续复盘/);
  assert.match(mock, /JSON\.stringify\(completed\)/);
  assert.match(page, /contentVersion=\{content\.version\}/);
});

test("practical mock snapshots and batch submission enforce the six-module blueprint", async () => {
  const [content, storage, mock, page, practicalApi] = await Promise.all([
    loadContentBank(),
    import(new URL("../lib/practical-exam-storage.ts", import.meta.url)),
    readFile(new URL("../components/PracticalMock.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/practical/mock/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/practical/attempt/route.ts", import.meta.url), "utf8"),
  ]);
  const byCode = new Map(content.practical.map((task) => [task.code, task]));
  const officialTasks = content.officialPracticalMockCodes.map((code) => byCode.get(code));
  const deadlineAt = 2_000_000;
  const running = storage.createPracticalExamSnapshot({
    contentVersion: content.version,
    phase: "running",
    mode: "official",
    tasks: officialTasks,
    current: 0,
    deadlineAt,
    completed: {},
    answers: {},
    checks: {},
    rubric: {},
    results: {},
  });
  const restored = storage.restorePracticalExamSnapshot(JSON.stringify(running), content.practical, officialTasks, content.version, 1_000_000);
  assert.equal(restored.snapshot.phase, "running");
  assert.deepEqual(restored.tasks.map((task) => task.code), content.officialPracticalMockCodes);
  assert.deepEqual(storage.validatePracticalExamTasks(content.officialPracticalMockCodes, content.practical).map((task) => task.code), content.officialPracticalMockCodes);
  assert.equal(storage.restorePracticalExamSnapshot(JSON.stringify(running), content.practical, officialTasks, "stale-content", 1_000_000), null);

  const duplicate = structuredClone(running);
  duplicate.taskCodes[1] = duplicate.taskCodes[0];
  assert.equal(storage.restorePracticalExamSnapshot(JSON.stringify(duplicate), content.practical, officialTasks, content.version, 1_000_000), null);
  assert.equal(storage.validatePracticalExamTasks(content.officialPracticalMockCodes.slice(0, 5), content.practical), null);
  assert.equal(storage.validatePracticalExamTasks([...content.officialPracticalMockCodes].reverse(), content.practical), null);
  assert.equal(storage.validatePracticalExamTasks([...content.officialPracticalMockCodes.slice(0, 5), "unknown-task"], content.practical), null);
  const wrongModule = structuredClone(running);
  wrongModule.taskCodes[1] = content.practical.find((task) => task.group === "1.2" && task.code !== wrongModule.taskCodes[0]).code;
  assert.equal(storage.restorePracticalExamSnapshot(JSON.stringify(wrongModule), content.practical, officialTasks, content.version, 1_000_000), null);

  const alternativeTasks = [
    content.practical.find((task) => ["1.1", "1.2"].includes(task.group) && task.code !== officialTasks[0].code),
    content.practical.find((task) => task.group === "2.1" && task.code !== officialTasks[1].code),
    content.practical.find((task) => task.group === "2.2" && task.code !== officialTasks[2].code),
    content.practical.find((task) => task.group === "3.1" && task.code !== officialTasks[3].code),
    content.practical.find((task) => task.group === "3.2" && task.code !== officialTasks[4].code),
    content.practical.find((task) => ["4.1", "4.2"].includes(task.group) && task.code !== officialTasks[5].code),
  ];
  const random = storage.createPracticalExamSnapshot({ ...running, mode: "random", tasks: alternativeTasks });
  assert.ok(storage.restorePracticalExamSnapshot(JSON.stringify(random), content.practical, officialTasks, content.version, 1_000_000));
  const falselyOfficial = { ...random, mode: "official" };
  assert.equal(storage.restorePracticalExamSnapshot(JSON.stringify(falselyOfficial), content.practical, officialTasks, content.version, 1_000_000), null);

  const firstTask = officialTasks[0];
  const responseTask = officialTasks.find((task) => task.group === "3.1");
  const wordTask = officialTasks.find((task) => task.group === "4.2");
  const responseFields = storage.practicalExamAnswerFieldIds(responseTask);
  const wordFields = storage.practicalExamAnswerFieldIds(wordTask);
  assert.deepEqual(responseFields, ["deliverable-1", "deliverable-2"]);
  assert.deepEqual(wordFields, ["blank-1", "blank-2", "blank-3", "blank-4", "blank-5"]);
  const explicitZero = firstTask.rubric[0];
  const invalidItem = firstTask.rubric[1];
  const review = {
    ...running,
    phase: "review",
    current: 99,
    completed: { [firstTask.code]: true, outsider: true },
    answers: {
      [firstTask.code]: { notes: "x".repeat(20_050), forged: "remove" },
      [responseTask.code]: { "deliverable-1": "analysis", forged: "remove" },
      [wordTask.code]: { "blank-1": "会员信息", forged: "remove" },
      outsider: { notes: "remove" },
    },
    checks: {
      [wordTask.code]: { "blank-1": true, forged: true },
      [responseTask.code]: { "deliverable-1": true },
      outsider: { "blank-1": true },
    },
    rubric: { [firstTask.code]: { [explicitZero.id]: 0, [invalidItem.id]: invalidItem.points + 99 }, outsider: { M1: 5 } },
    results: { [firstTask.code]: { score: 99, maxScore: 25, passed: true } },
  };
  const restoredReview = storage.restorePracticalExamSnapshot(JSON.stringify(review), content.practical, officialTasks, content.version, 1_000_000);
  assert.equal(restoredReview.snapshot.current, 5);
  assert.deepEqual(restoredReview.completed, { [firstTask.code]: true });
  assert.equal(restoredReview.answers[firstTask.code].notes.length, 10_000);
  assert.deepEqual(restoredReview.answers[responseTask.code], { "deliverable-1": "analysis" });
  assert.deepEqual(restoredReview.answers[wordTask.code], { "blank-1": "会员信息" });
  assert.deepEqual(restoredReview.checks, { [wordTask.code]: { "blank-1": true } });
  assert.deepEqual(restoredReview.results, {});
  assert.equal(restoredReview.rubric[firstTask.code][explicitZero.id], 0);
  assert.equal(Object.hasOwn(restoredReview.rubric[firstTask.code], invalidItem.id), false);

  const fullRubric = Object.fromEntries(officialTasks.map((task) => [task.code, Object.fromEntries(task.rubric.map((item) => [item.id, item.points]))]));
  const verifiedResults = storage.calculatePracticalExamResults(officialTasks, fullRubric);
  const result = storage.createPracticalExamSnapshot({ ...running, phase: "result", tasks: officialTasks, rubric: fullRubric, results: verifiedResults });
  const restoredResult = storage.restorePracticalExamSnapshot(JSON.stringify(result), content.practical, officialTasks, content.version, 1_000_000);
  assert.equal(restoredResult.snapshot.phase, "result");
  assert.equal(Object.values(restoredResult.results).reduce((sum, item) => sum + item.score, 0), 100);
  const forged = structuredClone(result);
  forged.results[firstTask.code].score -= 1;
  assert.equal(storage.restorePracticalExamSnapshot(JSON.stringify(forged), content.practical, officialTasks, content.version, 1_000_000), null);
  const expired = storage.restorePracticalExamSnapshot(JSON.stringify(running), content.practical, officialTasks, content.version, deadlineAt + 1);
  assert.equal(expired.snapshot.phase, "review");
  assert.match(mock, /PRACTICAL_MOCK_STORAGE_KEY/);
  assert.match(mock, /attempts: tasks\.map/);
  assert.equal((mock.match(/fetch\("\/api\/practical\/attempt"/g) ?? []).length, 1);
  assert.doesNotMatch(mock, /Promise\.all\(tasks\.map/);
  assert.match(practicalApi, /validatePracticalExamTasks/);
  // 六个模块要么全写要么全不写。断言用的是事务本身，不绑定它外面套了什么——
  // 现在外面套着 withDbDeadline，超时会退掉连接、未提交的事务随之回滚。
  assert.match(practicalApi, /db\.transaction\(/);
  assert.match(practicalApi, /await transaction\.insert/);
  assert.match(practicalApi, /Object\.fromEntries/);
  assert.match(practicalApi, /scorePractical/);
  assert.match(practicalApi, /db\.insert\(practicalAttempts\)/);
  assert.match(page, /contentVersion=\{content\.version\}/);
});

test("progress keeps only theory type progress, wrong answers, and favorites", async () => {
  const [progressApi, progressData, theoryState, dashboard, page] = await Promise.all([
    readFile(new URL("../app/api/progress/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/progress-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/theory/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/ProgressDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/progress/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(progressApi, /getProgressData/);
  assert.match(progressData, /theoryTypeProgress/);
  assert.match(progressData, /answeredRows/);
  assert.match(progressData, /wrongItems/);
  assert.match(progressData, /favoriteItems/);
  assert.match(theoryState, /answeredIds/);
  assert.match(dashboard, /data\.theoryTypeProgress\.map/);
  assert.match(dashboard, /待订正错题/);
  assert.match(dashboard, /我的收藏/);
  assert.match(page, /理论题型进度、待订正错题和收藏内容/);
  assert.doesNotMatch(`${progressData}${dashboard}`, /practicalAbility|estimatedPracticalScore|recentMocks|recentPractical|progress-next|progress-history|两科分别判定|实操官方权重/);
});

test("starter preview is fully removed and social metadata asset exists", async () => {
  const [layout, packageJson, og] = await Promise.all([readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"), readFile(new URL("../package.json", import.meta.url), "utf8"), readFile(new URL("../public/og.jpg", import.meta.url))]);
  assert.doesNotMatch(layout, /codex-preview|_sites-preview|Starter Project/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  // 下限挡住占位图，上限挡住「换张原图直接扔进 public」——分享卡片由微信、Twitter 这类
  // 抓取器现拉现渲染，超过 1MB 的图它们经常直接放弃，卡片就变成没有配图的纯文字。
  assert.ok(og.length > 100_000 && og.length < 1_000_000, `og.jpg 应在 100KB–1MB 之间，当前 ${og.length} 字节`);
});

test("JupyterLite ships isolated task workspaces, all notebooks, local runtimes, and both site bridge extensions", async () => {
  const [content, lite, host, labShell, configUtils, bridgeExtension, bridgePackage, pyodideKernelPackage, buildScript, patchScript, extensionBuildScript, runtimeCopyScript, packageJson, edgeOneConfig, labManifest, nextConfig, notebookGenerator, playwrightConfig, playwrightGlobalSetup, builtServer, runtimeHelpers] = await Promise.all([
    loadContentBank(),
    readFile(new URL("../public/lite/jupyter-lite.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../components/JupyterLiteLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/lite/lab/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/lite/config-utils.js", import.meta.url), "utf8"),
    readFile(new URL("../jupyterlite-extension/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../jupyterlite-extension/package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/lite/extensions/@jupyterlite/pyodide-kernel-extension/package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../scripts/build-jupyterlite.ps1", import.meta.url), "utf8"),
    readFile(new URL("../scripts/patch-jupyterlite-config.py", import.meta.url), "utf8"),
    readFile(new URL("../scripts/build-jupyterlite-extension.ps1", import.meta.url), "utf8"),
    readFile(new URL("../scripts/copy-onnxruntime-web.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../edgeone.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/labs/manifest.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/generate-jupyterlite-notebooks.py", import.meta.url), "utf8"),
    readFile(new URL("../playwright.config.mjs", import.meta.url), "utf8"),
    readFile(new URL("./e2e/global-setup.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/start-built-server.mjs", import.meta.url), "utf8"),
    readFile(new URL("./e2e/jupyterlite-runtime-helpers.mjs", import.meta.url), "utf8"),
  ]);
  const extensions = lite["jupyter-config-data"].federated_extensions;
  const notebookOverrides = lite["jupyter-config-data"].settingsOverrides["@jupyterlab/notebook-extension:tracker"];
  assert.equal(lite["jupyter-config-data"].appUrl, "./lab");
  assert.equal(lite["jupyter-config-data"].appVersion, "0.6.4");
  assert.equal(
    lite["jupyter-config-data"].litePluginSettings["@jupyterlite/pyodide-kernel-extension:kernel"].pyodideUrl,
    "./static/pyodide/pyodide.js",
  );
  // The async bridge startup preflight completes before the Lab router opens
  // ?path=. DocumentContext can therefore be the sole cold-start owner while
  // still seeing Service Worker control and the registered Python kernelspec.
  assert.equal(notebookOverrides.autoStartDefaultKernel, true);
  assert.equal(Object.hasOwn(notebookOverrides, "autoStartDefault"), false);
  assert.match(labShell, /build\/lab\/bundle\.js/);
  assert.match(labShell, /data-notebook="lab"/);
  assert.match(host, /workspace=\$\{workspaceSlug\}-embed/);
  assert.match(host, /20260814-kernel-owner-runtime12/);
  assert.match(host, /path: notebookPath/);
  assert.match(host, /connectionTimer/);
  assert.match(host, /JupyterLite 主界面加载超时/);
  assert.match(host, /bridge\.ready\.then[\s\S]*\.catch/);
  assert.match(configUtils, /applyQueryOverrides/);
  assert.match(configUtils, /config\.workspace = workspace/);
  assert.match(configUtils, /\/lite\/static\/pyodide\/pyodide\.js/);
  assert.match(configUtils, /pyodideUrl\.searchParams\.set\('runtime', runtime\)/);
  assert.match(configUtils, /pyodideUrl\.searchParams\.set\('attempt', attempt\)/);
  assert.match(labShell, /config-utils\.js\?_=20260814-kernel-owner-runtime12/);
  assert.doesNotMatch(bridgeExtension, /kernelStarts|sessionContext\.changeKernel/);
  assert.doesNotMatch(bridgeExtension, /KERNEL_ATTACH_GRACE_MS|attachDeadline/);
  assert.match(bridgeExtension, /sessionContext\.initialize\(\)/);
  assert.match(bridgeExtension, /RuntimePhase/);
  assert.match(bridgeExtension, /runtimeStates/);
  assert.match(bridgeExtension, /generation/);
  assert.match(bridgeExtension, /waitForKernelUsable/);
  assert.match(bridgeExtension, /ensureServiceWorkerControl/);
  assert.match(bridgeExtension, /IServiceWorkerManager/);
  assert.match(bridgeExtension, /serviceWorkerManager\.ready/);
  assert.match(bridgeExtension, /serviceWorkerManager\.enabled/);
  assert.match(bridgeExtension, /navigator\.serviceWorker\.controller/);
  assert.match(bridgeExtension, /ai-trainer:probe-environment/);
  assert.match(bridgeExtension, /poisonedGenerations/);
  assert.match(bridgeExtension, /必须重启内核后再准备环境/);
  assert.match(host, /restart-and-prepare/);
  assert.match(host, /重启并重试/);
  assert.match(bridgeExtension, /JupyterLite 持久化目录 \/drive 未挂载/);
  assert.match(bridgeExtension, /PIPLITE_IMPORT_NAMES/);
  assert.match(bridgeExtension, /_import_module\(_module\)/);
  assert.doesNotMatch(bridgeExtension, /await piplite\.install\([^\n]+\)[\s\S]{0,300}import openpyxl/);
  assert.match(bridgeExtension, /ai-trainer:get-runtime-state/);
  assert.match(bridgeExtension, /ai-trainer:restart-and-prepare/);
  assert.match(bridgeExtension, /kernel\.info|existing\.info/);
  assert.match(bridgeExtension, /preparationRuns/);
  assert.match(bridgeExtension, /preparationFailure/);
  assert.match(bridgeExtension, /IKernelSpecs/);
  assert.match(bridgeExtension, /kernelSpecs\.specs/);
  assert.match(bridgeExtension, /ai-trainer:prepare-exercise/);
  assert.match(bridgeExtension, /NotebookActions\.runCells/);
  assert.match(bridgeExtension, /ai-trainer-onnx/);
  assert.match(bridgeExtension, /scrollToCell/);
  assert.match(bridgeExtension, /collapseLeft/);
  assert.match(bridgeExtension, /hideInfrastructureCells/);
  assert.match(bridgeExtension, /ai-trainer:set-fill-review/);
  assert.match(bridgeExtension, /FillReferenceWidget/);
  assert.match(bridgeExtension, /Decoration\.widget/);
  assert.match(bridgeExtension, /classifyFill/);
  assert.match(bridgeExtension, /完全一致/);
  assert.match(bridgeExtension, /与参考不同/);
  assert.match(bridgeExtension, /fillBlankIntoEditor/);
  assert.match(host, /自动比对仅供参考，最终以运行结果为准/);
  assert.match(bridgeExtension, /if \(examMode\) return \{ ok: false, summary: emptyFillSummary\(\) \}/);
  assert.match(bridgeExtension, /data\.path|path: panel\.context\.path/);
  assert.doesNotMatch(bridgeExtension, /kernelBootstrap/);
  assert.match(buildScript, /patch-jupyterlite-config\.py/);
  assert.match(buildScript, /JUPYTERLITE_PYTHON/);
  assert.match(buildScript, /jupyterlite_core\.app/);
  assert.match(buildScript, /labs:runtime/);
  assert.match(buildScript, /\$pyodideVersion = "0\.27\.7"/);
  assert.match(buildScript, /"xgboost"/);
  assert.match(buildScript, /"opencv-python"/);
  assert.match(buildScript, /"ssl"/);
  assert.match(buildScript, /Get-ChildItem -LiteralPath \$resolvedPyodideDir -File -Filter "\*\.whl"/);
  assert.match(patchScript, /RUNTIME_REVISION = "20260814-kernel-owner-runtime12"/);
  assert.match(patchScript, /pyodideSettings\.pyodideUrl/);
  assert.match(patchScript, /pyodide\.js/);
  assert.match(patchScript, /pyodide\.mjs/);
  assert.match(patchScript, /normalize_contents_models/);
  assert.match(patchScript, /normalized_path = model_path\.replace/);
  assert.doesNotMatch(buildScript, /Move-JavaScriptModule/);
  assert.match(extensionBuildScript, /ItemType Junction/);
  assert.match(extensionBuildScript, /jupyterlite-extension/);
  assert.equal(bridgePackage.dependencies["@jupyterlite/kernel"], "~0.6.4");
  assert.deepEqual(bridgePackage.jupyterlab.sharedPackages["@jupyterlite/kernel"], { bundled: false, singleton: true });
  assert.equal(pyodideKernelPackage.version, "0.6.1");
  assert.equal(packageJson.dependencies["onnxruntime-web"], "1.27.0");
  assert.match(runtimeCopyScript, /Expected onnxruntime-web/);
  const JavaScriptModuleMime = "application/javascript; charset=utf-8";
  // A rule source may carry a trailing "*" so EdgeOne also matches the
  // query-string forms of the same file; compare against the bare path.
  const bareSource = rule => rule.source.replace(/\*$/, "");
  const moduleHeaderSources = new Set(edgeOneConfig.headers
    .filter(rule => rule.headers.some(header => header.key === "Content-Type" && header.value === JavaScriptModuleMime))
    .map(bareSource));
  for (const source of [
    "/lite/static/pyodide/pyodide.js",
    "/lite/static/pyodide/pyodide.asm.js",
    "/labs/runtime/onnxruntime-web/1.27.0/ort.wasm.bundle.min.js",
    "/labs/runtime/onnxruntime-web/1.27.0/ort-wasm-simd-threaded.js",
  ]) {
    assert.ok(moduleHeaderSources.has(source), `${source} must be served as JavaScript`);
  }

  // Files that change whenever JupyterLite or Pyodide is rebuilt but carry no
  // content hash in their name must never be served as immutable. A stale
  // immutable copy pins deleted bundle hashes or a mismatched pyodide-lock.json
  // and silently breaks kernel startup until the browser cache expires.
  // EdgeOne sources are globs and "*" may sit anywhere in the path.
  const ruleMatches = (rule, path) => new RegExp(
    `^${rule.source.split("*").map(part => part.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)).join(".*")}$`,
  ).test(path);
  const headerValuesFor = (path, key) => edgeOneConfig.headers
    .filter(rule => ruleMatches(rule, path))
    .flatMap(rule => rule.headers)
    .filter(header => header.key === key)
    .map(header => header.value);
  const cacheRuleFor = path => headerValuesFor(path, "Cache-Control");
  for (const path of [
    "/lite/jupyter-lite.json",
    "/lite/jupyter-lite.ipynb",
    "/lite/lab/jupyter-lite.json",
    "/lite/lab/jupyter-lite.ipynb",
    "/lite/config-utils.js",
    "/lite/service-worker.js",
    "/lite/static/pyodide/pyodide.js",
    "/lite/static/pyodide/pyodide.mjs",
    "/lite/static/pyodide/pyodide.asm.js",
    "/lite/static/pyodide/pyodide.asm.wasm",
    "/lite/static/pyodide/pyodide-lock.json",
    "/lite/static/pyodide/python_stdlib.zip",
  ]) {
    const values = cacheRuleFor(path);
    assert.ok(values.length > 0, `${path} needs an explicit Cache-Control rule`);
    // Verified against production: when several rules match one path, EdgeOne
    // applies the last one in file order. A specific revalidating rule must
    // therefore sit after any broad immutable rule that also matches it.
    assert.match(
      values.at(-1),
      /max-age=0[\s\S]*must-revalidate/,
      `${path} must revalidate; its last matching rule still declares ${values.at(-1)}`,
    );
  }

  // Service Worker is now the sole durable filesystem bridge. COOP/COEP would
  // select pyodide-kernel's SharedArrayBuffer/Atomics coincident worker, whose
  // synchronous drive calls can deadlock while the kernel still says connected.
  const headerValueFor = (path, key) => headerValuesFor(path, key).at(-1);
  for (const path of ["/practical/1.1.2/lab", "/lite/lab/index.html"]) {
    assert.equal(headerValueFor(path, "Cross-Origin-Opener-Policy"), undefined, path);
    assert.equal(headerValueFor(path, "Cross-Origin-Embedder-Policy"), undefined, path);
  }
  assert.doesNotMatch(nextConfig, /Cross-Origin-Opener-Policy|Cross-Origin-Embedder-Policy/);
  assert.doesNotMatch(host, /cross-origin-isolated/);
  assert.match(playwrightConfig, /globalSetup: ["']\.\/tests\/e2e\/global-setup\.mjs["']/);
  assert.doesNotMatch(playwrightConfig, /\bwebServer:/);
  assert.match(playwrightGlobalSetup, /start-built-server\.mjs/);
  assert.match(playwrightGlobalSetup, /child\.kill\(["']SIGTERM["']\)/);
  // Command registration happens before the asynchronous startup preflight
  // resolves. Direct-Lab tests must prove the requested path is registered in
  // the shell before executing a panel-scoped command.
  assert.match(runtimeHelpers, /waitForNotebookPanel/);
  assert.match(runtimeHelpers, /app\.shell\.widgets\(["']main["']\)/);
  assert.match(runtimeHelpers, /observed\.commandReady && observed\.panelOpen/);
  assert.match(builtServer, /\.next["'], ["']standalone/);
  assert.match(builtServer, /server\.js/);
  assert.match(builtServer, /next-start\.js/);
  assert.doesNotMatch(builtServer, /node:child_process|\bspawn\(/);
  // 告警屏蔽与 piplite 安装由扩展通过静默内核请求下发，官方题目文件里不含任何
  // 环境准备代码；每题的依赖清单只以 ai_trainer.pip_packages 元数据形式随行。
  assert.match(bridgeExtension, /filterwarnings\('ignore', category=FutureWarning\)/);
  assert.match(bridgeExtension, /piplite\.install/);
  assert.match(bridgeExtension, /silent = true/);
  assert.match(bridgeExtension, /requestExecute\(\{[\s\S]*?silent,/);
  // piplite 只该出现在 pyodide 装不了的纯 Python wheel 上；自带包 import 时会由
  // loadPackagesFromImports 自动加载，装它们是空转。生成器的清单必须与构建脚本
  // 真正下载的纯 Python wheel 一致。
  const pipliteOnly = notebookGenerator.match(/PIPLITE_ONLY_PACKAGES = \{([^}]*)\}/)[1]
    .match(/"([^"]+)"/g).map(entry => entry.slice(1, -1)).sort();
  const purePythonWheels = buildScript.match(/\$purePythonRequirements = @\(([\s\S]*?)\n\)/)[1]
    .match(/"([^"=]+)==/g).map(entry => entry.slice(1, -2));
  assert.deepEqual(
    pipliteOnly,
    purePythonWheels.filter(name => pipliteOnly.includes(name)).sort(),
    "生成器的 piplite 清单必须都是构建脚本下载的纯 Python wheel",
  );
  for (const task of content.practical.filter(item => item.hasNotebook)) {
    const workspaceDir = task.code.replaceAll(".", "-");
    const notebook = JSON.parse(
      await readFile(new URL(`../public/lite/files/${workspaceDir}/${task.code}.ipynb`, import.meta.url), "utf8"),
    );
    for (const name of notebook.metadata.ai_trainer.pip_packages) {
      assert.ok(pipliteOnly.includes(name), `${task.code} 不该用 piplite 安装 pyodide 自带的 ${name}`);
    }
  }

  // isSubstantiveNotebook 挡截断的模板与草稿，但它的下限一旦高于真实题目的单元数，
  // 就会把合法题目判为无效——2.1.3/2.1.4/2.1.5 只有一个习题单元，环境准备单元移出
  // 后曾因 >= 2 打不开。这里把护栏的阈值与实际产物绑在一起。
  const [, cellFloor, sourceFloor] = host.match(
    /notebook\.cells\.length >= (\d+) && notebookSourceLength\(notebook\) >= (\d+)/,
  );
  for (const task of content.practical.filter(item => item.hasNotebook)) {
    const workspaceDir = task.code.replaceAll(".", "-");
    const notebook = JSON.parse(
      await readFile(new URL(`../public/lite/files/${workspaceDir}/${task.code}.ipynb`, import.meta.url), "utf8"),
    );
    const sourceLength = notebook.cells.reduce((total, cell) => total + cell.source.join("").length, 0);
    assert.ok(
      notebook.cells.length >= Number(cellFloor),
      `${task.code} 只有 ${notebook.cells.length} 个单元，会被 isSubstantiveNotebook 的下限 ${cellFloor} 判为无效`,
    );
    assert.ok(sourceLength >= Number(sourceFloor), `${task.code} 源码长度 ${sourceLength} 低于护栏下限`);
  }

  // Keep the audited official asset bytes unchanged. The bridge normalizes the
  // mounted workspace copy before first import, removing Python 3.12's
  // probabilistic `invalid escape sequence '\_'` SyntaxWarning.
  assert.match(bridgeExtension, /_box_raw_docstring/);
  assert.match(bridgeExtension, /3\.2\.5 辅助源码结构变化/);

  // 题目切换索引渲染在客户端组件里，必须与 content.practical 保持一致，否则上一题
  // / 下一题会指错。它单独存在的原因见 lib/practical-nav.ts。
  const navIndex = JSON.parse(await readFile(new URL("../data/practical-nav.json", import.meta.url), "utf8"));
  assert.deepEqual(
    navIndex,
    content.practical.map(task => ({ code: task.code, hasNotebook: task.hasNotebook, title: task.title })),
  );
  assert.doesNotMatch(
    await readFile(new URL("../components/PracticalTaskHeader.tsx", import.meta.url), "utf8"),
    /^import \{[^}]*\} from "@\/lib\/content"/m,
    "PracticalTaskHeader 属于客户端包，不能对 lib/content 做值导入",
  );

  const names = new Set(extensions.map(extension => extension.name));
  assert.ok(names.has("@jupyterlite/pyodide-kernel-extension"));
  assert.ok(names.has("jupyter-iframe-commands"));
  assert.ok(names.has("ai-trainer-jupyterlite"));
  for (const extension of extensions) {
    assert.doesNotMatch(extension.load, /\\/);
    await readFile(new URL(`../public/lite/extensions/${extension.name}/${extension.load}`, import.meta.url));
  }

  const tasks = content.practical.filter(task => task.hasNotebook);
  assert.equal(tasks.length, 20);
  let onnxNotebooks = 0;
  const nestedWorkspaceIndexes = new Set();
  for (const task of tasks) {
    // JupyterLite 判定目录靠 PathExt.extname()，带点的目录名会让 newUntitled 写错
    // 位置并造出遮蔽整个目录的同名空文件，所以工作区目录必须无点。
    const workspaceDir = task.code.replaceAll(".", "-");
    assert.doesNotMatch(workspaceDir, /\./, `${task.code} 的工作区目录名不能含点`);
    const notebookSource = await readFile(new URL(`../public/lite/files/${workspaceDir}/${task.code}.ipynb`, import.meta.url), "utf8");
    const notebook = JSON.parse(notebookSource);
    assert.equal(notebook.metadata.ai_trainer.task_code, task.code);
    assert.equal(notebook.metadata.ai_trainer.runtime, "jupyterlite-pyodide");
    assert.equal(notebook.metadata.ai_trainer.visible_content, "original-code-only");
    // 官方题目文件里不得出现环境准备单元：告警屏蔽与 piplite 安装由扩展通过静默
    // 内核请求下发，依赖清单只以元数据形式随题目走。
    assert.doesNotMatch(notebookSource, /JupyterLite 环境准备|piplite|pyfetch|环境已就绪/, `${task.code} 仍含环境准备代码`);
    assert.ok(Array.isArray(notebook.metadata.ai_trainer.pip_packages), `${task.code} 缺少 pip_packages 元数据`);
    assert.ok(notebook.cells.every(cell => cell.cell_type === "code"));
    assert.deepEqual(notebook.cells.map(cell => cell.source.join("")), task.notebook.cells.map(cell => cell.source));
    assert.doesNotMatch(notebookSource, /## 使用方法|## 评分点|ai-trainer-intro|ai-trainer-exercise-heading/);
    // ONNX 题改用元数据识别：浏览器运行时垫片已从 notebook 第 0 格移进扩展的准备阶段。
    // 它原先是 9026 字的只读单元，压在官方考题代码上面（3.2.2 的正文才 705 字），
    // 而进入实操题本来就有「下载依赖与素材」和「下载 ONNX 模型」两个准备阶段。
    const isOnnx = typeof notebook.metadata.ai_trainer.onnx_runtime === "string"
      && Boolean(notebook.metadata.ai_trainer.onnx_runtime);
    onnxNotebooks += Number(isOnnx);
    // 可见的 notebook 里不许再出现环境代码，垫片一并纳入这条。只看单元格源码：
    // 元数据里的 onnx_runtime: "onnxruntime-web@1.27.0" 是合法的，不该被这条挡下。
    const cellSource = notebook.cells.map(cell => cell.source.join("")).join("\n");
    assert.doesNotMatch(cellSource, /浏览器 ONNX Runtime|onnxruntime-web|ai-trainer-onnx/, `${task.code} 仍含运行时垫片`);
    const manifestTask = labManifest.tasks[task.code] ?? { assets: [] };
    for (const asset of manifestTask.assets ?? []) {
      const assetParts = asset.name.split("/");
      for (let depth = 1; depth < assetParts.length; depth += 1) {
        nestedWorkspaceIndexes.add(`${workspaceDir}/${assetParts.slice(0, depth).join("/")}/all.json`);
      }
      const relativeAssetPath = asset.name.split("/").map(encodeURIComponent).join("/");
      const [sourcePayload, builtPayload] = await Promise.all([
        readFile(new URL(`../jupyterlite/content/${workspaceDir}/${relativeAssetPath}`, import.meta.url)),
        readFile(new URL(`../public/lite/files/${workspaceDir}/${relativeAssetPath}`, import.meta.url)),
      ]);
      for (const [location, payload] of [["source workspace", sourcePayload], ["built workspace", builtPayload]]) {
        assert.equal(payload.length, asset.size, `${asset.name} has a stale size in the ${location}`);
        assert.equal(
          createHash("sha256").update(payload).digest("hex"),
          asset.sha256,
          `${asset.name} has a stale hash in the ${location}`,
        );
      }
    }
  }
  for (const relativeIndex of nestedWorkspaceIndexes) {
    const encodedIndex = relativeIndex.split("/").map(encodeURIComponent).join("/");
    const directoryModel = JSON.parse(
      await readFile(new URL(`../public/lite/api/contents/${encodedIndex}`, import.meta.url), "utf8"),
    );
    const pendingModels = [directoryModel];
    while (pendingModels.length > 0) {
      const model = pendingModels.pop();
      assert.doesNotMatch(model.path, /\\/, `${relativeIndex} contains a Windows path separator`);
      assert.equal(model.name, model.path.split("/").at(-1) ?? "", `${relativeIndex} contains a stale model name`);
      if (Array.isArray(model.content)) pendingModels.push(...model.content);
    }
  }
  assert.equal(onnxNotebooks, 5);

  // 垫片搬家后，「运行时本地供给、不走 CDN」这条约束跟着搬到扩展里。
  const onnxRuntimeModule = await readFile(new URL("../jupyterlite-extension/src/onnxRuntime.ts", import.meta.url), "utf8");
  assert.match(onnxRuntimeModule, /\/labs\/runtime\/onnxruntime-web\/1\.27\.0\//);
  assert.match(onnxRuntimeModule, /ort\.wasm\.bundle\.min\.js/);
  assert.doesNotMatch(onnxRuntimeModule, /cdn\.jsdelivr\.net/);
  assert.match(bridgeExtension, /onnxRuntimeSource/);

  const onnxRuntimeFiles = {
    "ort.wasm.bundle.min.js": "260f89cdf194fda484154d7a7ed3e3c88ee88dcf2ff4b0568085e5d2f72a1dd3",
    "ort-wasm-simd-threaded.js": "0a1e718d99c41b22c21f2520ff4f9e883a6b5533856e398d21816ee8eb8185d3",
    "ort-wasm-simd-threaded.wasm": "d1ab1b94b16a65b29d710d0b587b29e7bed336827577623913479b8afe8113e6",
  };
  for (const [name, expectedHash] of Object.entries(onnxRuntimeFiles)) {
    const payload = await readFile(new URL(`../public/labs/runtime/onnxruntime-web/1.27.0/${name}`, import.meta.url));
    assert.equal(createHash("sha256").update(payload).digest("hex"), expectedHash, `${name} has an invalid runtime hash`);
  }
  const pyodideEntry = await readFile(new URL("../public/lite/static/pyodide/pyodide.js", import.meta.url), "utf8");
  assert.match(pyodideEntry, /pyodide\.asm\.js/);
  await readFile(new URL("../public/lite/static/pyodide/pyodide.asm.js", import.meta.url));
  assert.match(host, /ai-trainer:get-notebook/);
  assert.match(host, /ai-trainer:set-notebook/);
  assert.match(host, /notebook:run-all-cells/);
  assert.match(host, /重启并重试/);
  assert.match(host, /\/lite\/lab\/index\.html/);
  for (const task of Object.values(labManifest.tasks)) {
    for (const asset of task.assets ?? []) {
      const payload = await readFile(new URL(`../public${decodeURIComponent(asset.url)}`, import.meta.url));
      assert.equal(payload.length, asset.size, `${asset.url} has a stale manifest size`);
      assert.equal(createHash("sha256").update(payload).digest("hex"), asset.sha256, `${asset.url} has a stale manifest hash`);
    }
  }

  // Chunk hashes are produced by the selected JupyterLab release. Validate
  // the generated core dynamically instead of pinning stale 0.8-era names.
  const buildFiles = await readdir(new URL("../public/lite/build/", import.meta.url));
  assert.ok(buildFiles.some(name => /^jlab_core\.[a-f0-9]+\.js$/.test(name)));
  assert.ok(buildFiles.filter(name => name.endsWith(".js")).length > 100);
  assert.equal(buildFiles.filter(name => name.endsWith(".map")).length, 0);

  // The Pyodide core archive includes package metadata, but not the wheels
  // required by either the kernel or the practical notebooks. Keep the full
  // compiled dependency closure local and verify it against Pyodide's lock.
  const pyodideLock = JSON.parse(await readFile(new URL("../public/lite/static/pyodide/pyodide-lock.json", import.meta.url), "utf8"));
  assert.deepEqual(pyodideLock.info, {
    abi_version: "2024_0",
    arch: "wasm32",
    platform: "emscripten_3_1_58",
    python: "3.12.7",
    version: "0.27.7",
  });
  assert.equal(pyodideLock.packages.pandas.version, "2.2.3");
  assert.equal(pyodideLock.packages.xgboost.version, "2.1.2");
  assert.equal(pyodideLock.packages["opencv-python"].version, "4.10.0.84");
  const normalizePackageName = name => name.toLowerCase().replaceAll("_", "-").replaceAll(".", "-");
  const packages = new Map(Object.entries(pyodideLock.packages).map(([name, metadata]) => [normalizePackageName(name), metadata]));
  const queue = ["micropip", "ipython", "jedi", "numpy", "pandas", "matplotlib", "scipy", "scikit-learn", "pillow", "xgboost", "opencv-python", "ssl"];
  const required = new Set();
  while (queue.length > 0) {
    const name = normalizePackageName(queue.pop());
    if (required.has(name)) continue;
    required.add(name);
    const metadata = packages.get(name);
    assert.ok(metadata, `Pyodide lock metadata is missing ${name}`);
    queue.push(...metadata.depends);
  }
  assert.equal(required.size, 39);
  const pyodideFiles = await readdir(new URL("../public/lite/static/pyodide/", import.meta.url));
  assert.equal(pyodideFiles.some(name => /cp314|pyodide_2025/.test(name)), false);
  for (const name of required) {
    const metadata = packages.get(name);
    const wheel = await readFile(new URL(`../public/lite/static/pyodide/${metadata.file_name}`, import.meta.url));
    assert.equal(createHash("sha256").update(wheel).digest("hex"), metadata.sha256, `${name} has an invalid or stale wheel`);
  }

  // Packages missing from the Pyodide lock are pinned as local pure-Python
  // wheels, so Notebook setup never silently succeeds without installing them.
  const pipliteIndex = JSON.parse(await readFile(new URL("../public/lite/pypi/all.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(pipliteIndex).sort(), ["comm", "et-xmlfile", "imbalanced-learn", "openpyxl", "seaborn"]);
  const pipliteUrls = lite["jupyter-config-data"].litePluginSettings["@jupyterlite/pyodide-kernel-extension:kernel"].pipliteUrls;
  assert.ok(pipliteUrls.some(url => /^\.\/pypi\/all\.json\?sha256=/.test(url)));
  for (const [name, project] of Object.entries(pipliteIndex)) {
    const releases = Object.values(project.releases).flat();
    assert.equal(releases.length, 1, `${name} should have one pinned release`);
    const release = releases[0];
    const wheel = await readFile(new URL(`../public/lite/pypi/${release.filename}`, import.meta.url));
    assert.equal(wheel.length, release.size, `${name} has an unexpected wheel size`);
    assert.equal(createHash("sha256").update(wheel).digest("hex"), release.digests.sha256, `${name} has an invalid wheel`);
  }
});

test("credential endpoints spend rate-limit quota before doing password work", async () => {
  const [throttle, login, register, schema] = await Promise.all([
    readFile(new URL("../lib/auth-throttle.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/register/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);

  // 计数必须落库。放进程内存的话，EdgeOne 多实例各数各的，并发就能把每个实例的额度
  // 分别用满，等于没限。断言的是「计数写进了表」，不是某个具体的取库写法。
  assert.match(schema, /auth_throttle/);
  assert.match(throttle, /INSERT INTO auth_throttle/);
  assert.doesNotMatch(throttle, /new Map\(|new Set\(|globalThis\./, "限流计数不能落在进程内存里");

  // 这是整条防线的关键顺序：verifyPassword / createPasswordRecord 每次要跑 10 万轮
  // PBKDF2，额度必须先扣。顺序反了就还是能被 CPU 放大打满。
  // 比的是调用点而不是 import 里的同名标识符，所以都带上左括号。
  for (const [name, route, expensive] of [["login", login, "verifyPassword("], ["register", register, "createPasswordRecord("]]) {
    assert.ok(route.indexOf("consumeThrottle(") < route.indexOf(expensive), `${name} 必须先扣额度再做密码运算`);
    assert.match(route, /tooManyRequests|429/);
  }

  // X-Forwarded-For 的最左位由客户端控制，拿它当身份等于让攻击者自己发号；
  // EO-Connecting-IP 由 EdgeOne 边缘节点写入，必须排在前面。
  assert.ok(throttle.indexOf("eo-connecting-ip") < throttle.indexOf("x-forwarded-for"), "必须优先采信 EO-Connecting-IP");

  // 邮箱额度只记失败，正常登录的人不该被自己的成功登录挤下线：进门时只读查看，
  // 密码校验失败之后才累加。
  assert.ok(login.indexOf("peekThrottle(") < login.indexOf("verifyPassword("), "邮箱额度应在密码校验前只读检查");
  assert.ok(login.indexOf("consumeThrottle(failureBucket") > login.indexOf("verifyPassword("), "邮箱额度应当只在校验失败后累加");
});

test("self-hosted releases preserve proxy trust, runtime health, and cache semantics", async () => {
  const [nextConfig, packageJson, database, throttle, live, ready, nginx, systemd, envExample, packaging, guide, deployWorkflow, deployScript, deployBootstrap, knownHosts] = await Promise.all([
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/auth-throttle.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/live/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/ready/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../deploy/nginx/aitrainer.conf", import.meta.url), "utf8"),
    readFile(new URL("../deploy/systemd/aitrainer.service", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../scripts/package-self-hosted.mjs", import.meta.url), "utf8"),
    readFile(new URL("../docs/SELF-HOSTING.md", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/deploy-self-hosted.yml", import.meta.url), "utf8"),
    readFile(new URL("../deploy/scripts/deploy-release.sh", import.meta.url), "utf8"),
    readFile(new URL("../deploy/scripts/bootstrap-deploy-user.sh", import.meta.url), "utf8"),
    readFile(new URL("../deploy/ssh/known_hosts", import.meta.url), "utf8"),
  ]);

  assert.match(nextConfig, /SELF_HOSTED_BUILD/);
  assert.match(nextConfig, /output:\s*["']standalone["']/);
  assert.equal(JSON.parse(packageJson).scripts["package:self-hosted"], "node scripts/package-self-hosted.mjs");
  assert.match(packaging, /\.next["'], ["']static/);
  assert.match(packaging, /["']public["']/);
  assert.match(packaging, /SOURCE_REVISION/);

  assert.match(database, /DATABASE_POOL_MAX/);
  assert.match(database, /MAX_DATABASE_POOL_MAX/);
  assert.match(throttle, /TRUSTED_CLIENT_IP_HEADER/);
  assert.match(throttle, /SUPPORTED_TRUSTED_ADDRESS_HEADERS/);
  assert.match(envExample, /TRUSTED_CLIENT_IP_HEADER=eo-connecting-ip/);

  assert.match(live, /status:\s*["']ok["']/);
  assert.match(ready, /drizzle\.__drizzle_migrations/);
  assert.match(ready, /DATABASE_SCHEMA_VERSION/);
  assert.match(ready, /status:\s*503/);
  assert.match(ready, /Cache-Control["']:\s*["']no-store/);

  assert.match(nginx, /client_max_body_size 8m/);
  assert.match(nginx, /application\/javascript mjs/);
  assert.match(nginx, /proxy_set_header X-Real-IP \$remote_addr/);
  assert.match(nginx, /proxy_set_header EO-Connecting-IP ["']["']/);
  assert.match(nginx, /pyodide-lock\\\.json[\s\S]*must-revalidate/);
  assert.match(nginx, /labs\/models\/[\s\S]*max-age=31536000/);
  // EdgeOne 作为 CDN 回源阿里云时，页面文档的缓存语义由 Nginx 单点决定。default 若
  // 退回空字符串，Next 对预渲染页面发的 `s-maxage=31536000` 会原样透给 CDN，改了
  // 首页也同步不到用户；不隐藏 Next 的 Cache-Control 则等于没覆盖。
  assert.match(nginx, /default "public, max-age=0, must-revalidate"/);
  assert.match(nginx, /~\^\/api\/ "no-store"/);
  assert.match(nginx, /proxy_hide_header Cache-Control;/);
  assert.match(systemd, /User=aitrainer/);
  assert.match(systemd, /HOSTNAME=127\.0\.0\.1/);
  assert.match(systemd, /SuccessExitStatus=143/);
  assert.match(systemd, /TRUSTED_CLIENT_IP_HEADER=x-real-ip/);
  assert.match(guide, /http:\/\/localhost:8080/);

  const qualityWorkflow = await readFile(new URL("../.github/workflows/quality.yml", import.meta.url), "utf8");
  const databaseManager = await readFile(new URL("../scripts/manage-database.mjs", import.meta.url), "utf8");
  assert.match(qualityWorkflow, /pull_request:/);
  assert.match(qualityWorkflow, /push:[\s\S]*branches:[\s\S]*- main/);
  assert.match(qualityWorkflow, /npm audit --omit=dev --audit-level=high/);
  assert.match(qualityWorkflow, /npm run test:ci/);
  assert.match(qualityWorkflow, /aitrainer-\$\{\{ github\.sha \}\}/);
  assert.match(deployWorkflow, /workflow_run:/);
  assert.match(deployWorkflow, /workflows:[\s\S]*- Quality gate/);
  assert.match(deployWorkflow, /conclusion == 'success'/);
  assert.match(deployWorkflow, /workflow_run\.head_sha/);
  assert.match(deployWorkflow, /run-id:\s*\$\{\{ github\.event\.workflow_run\.id \}\}/);
  assert.match(deployWorkflow, /DEPLOY_SSH_PRIVATE_KEY/);
  assert.match(deployWorkflow, /StrictHostKeyChecking=yes/);
  assert.match(deployWorkflow, /sudo \/usr\/local\/sbin\/deploy-aitrainer/);
  assert.doesNotMatch(deployWorkflow, /root@|home\.pem/);
  assert.match(deployScript, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(deployScript, /flock -n/);
  assert.match(deployScript, /sha256sum/);
  assert.match(deployScript, /install -o aitrainer -g aitrainer -m 0400/);
  assert.match(deployScript, /runuser -u aitrainer -- tar -xzf "\$\{staging_archive\}"/);
  assert.match(deployScript, /rolling back/);
  assert.match(deployScript, /api\/health\/ready/);
  assert.match(deployScript, /manage-database\.mjs migrate/);
  assert.match(deployScript, /manage-database\.mjs check/);
  assert.match(databaseManager, /pg_advisory_xact_lock/);
  assert.match(databaseManager, /Migration baseline is missing/);
  assert.match(databaseManager, /verifySchema/);
  assert.match(packaging, /manage-database\.mjs/);
  assert.equal(JSON.parse(packageJson).overrides["sanitize-html"], "2.17.6");
  assert.match(deployBootstrap, /restrict %s/);
  assert.match(deployBootstrap, /NOPASSWD: \/usr\/local\/sbin\/deploy-aitrainer/);
  assert.match(deployBootstrap, /passwd --lock deploy/);
  assert.match(knownHosts, /^39\.96\.7\.2 ssh-ed25519 /);
});

test("robots and sitemap keep crawlers on content and off the runtime", async () => {
  const [robots, sitemap] = await Promise.all([
    readFile(new URL("../app/robots.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8"),
  ]);

  // JupyterLite 运行时是几万个文件，/labs/ 下还有 46MB 的 ONNX 分片，放开只会烧抓取预算。
  for (const blocked of ["/lite/", "/labs/", "/api/", "/practical/*/lab", "/account", "/progress"]) {
    assert.ok(robots.includes(`"${blocked}"`), `robots.txt 应当 Disallow ${blocked}`);
  }
  // 题库内容是客户端取 /content/*.json 渲染的，挡掉就等于让爬虫看到空页。
  assert.doesNotMatch(robots, /"\/content\/"|"\/_next\/"/);
  assert.match(robots, /sitemap/);

  // sitemap 里不该出现登录后才有内容的页面，也不该出现会 302 的地址。
  assert.doesNotMatch(sitemap, /"\/account"|"\/progress"/);
  assert.match(sitemap, /practicalMockEnabled/);
  assert.match(sitemap, /content\.practical\.map/);
});

test("legal pages exist, are linked from every page, and describe what is actually collected", async () => {
  const [layout, privacy, terms, disclaimer, site] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/terms/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/disclaimer/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/site.ts", import.meta.url), "utf8"),
  ]);

  // 页尾三条链接出现在 layout 里，等于每一页都能到达。
  for (const href of ["/disclaimer", "/terms", "/privacy"]) assert.ok(layout.includes(`href="${href}"`), `页尾缺少 ${href}`);

  // 站点声明与官方无关，这一条必须在页尾常驻，而不只藏在免责声明页里。
  assert.match(layout, /无隶属或授权关系/);
  assert.match(disclaimer, /不是官方标准答案/);

  // 隐私政策必须覆盖真实存在的数据项。断言约束的是「有没有把这件事告诉用户」，
  // 不是用了哪个算法或哪个存储 API——后者属于实现细节，正文里刻意不写。
  assert.match(privacy, /不保存明文/);
  assert.match(privacy, /Cookie/);

  // 反过来，账号安全的防护手段不能出现在这一页：它是公开的，写明「按 IP 限制注册与
  // 登录频率」等于把挡什么、从哪个方向绕一并告诉攻击者。这条断言守的是这个决定，
  // 免得日后有人「补全隐私披露」时又把它写回去。只看会渲染出去的部分，源码注释里
  // 解释这个决定本身要用到这些词。
  const privacyText = privacy.replace(/^\s*\/\/.*$/gm, "");
  for (const leak of [/IP/, /撞库/, /频率/, /限流/]) assert.doesNotMatch(privacyText, leak);
  // 数据存在东京、站点在境外，这两点决定了用户数据受哪边管辖，必须写明。
  assert.match(privacy, /东京/);
  assert.match(privacy, /中国大陆境外/);

  // 两处条款都承诺「发邮件可以处理」，联系方式就必须真的存在。
  assert.match(site, /SITE_CONTACT_EMAIL/);
  assert.match(terms, /请通过页尾邮箱联系/);
});

test("Chinese paragraphs are not wrapped in JSX source", async () => {
  // JSX 里换行 + 缩进会被渲染成一个空格。英文里那正是想要的，中文里就是句子中间
  // 平白多出一个空隙（「不登录也可以␣浏览题库」）。所以中文段落必须写成单行。
  const files = ["app/privacy/page.tsx", "app/terms/page.tsx", "app/disclaimer/page.tsx", "components/LegalPage.tsx"];
  const wrapped = /[\u4e00-\u9fa5、，。；：（）]\r?\n\s+[\u4e00-\u9fa5]/;
  for (const file of files) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, wrapped, `${file} 有被换行截断的中文段落，渲染后会多出空格`);
  }
});

test("content lives in a reviewable entity layer, not one 944KB single-line blob", async () => {
  // data/content.json 曾是 944KB 挤在一行：`git log --numstat` 对它永远输出 `1 1`，
  // 一行改、一行增。内容正确性是这个产品的核心价值，而每一次内容变更都无法评审。
  // 现在题库拆成 data/entities/ 下的实体文件，改一道题只碰一个几 KB 的文件。
  const { assembleBank, entitiesRoot, practicalCodes } = await import("../scripts/assemble-entities.mjs");
  const { readdir, readFile, access } = await import("node:fs/promises");
  const { join } = await import("node:path");

  await assert.rejects(access(new URL("../data/content.json", import.meta.url)), "旧的单文件不应再存在");

  const codes = await practicalCodes();
  assert.equal(codes.length, 40);
  for (const name of ["judge", "single", "multi"]) {
    const questions = JSON.parse(await readFile(join(entitiesRoot, "theory", `${name}.json`), "utf8"));
    assert.equal(questions.length, 300, `${name} 应为 300 题`);
    assert.ok(questions.every(q => q.type === name), `${name}.json 混入了别的题型`);
  }

  // 每个实体文件都必须是可评审的格式：缩进两格、中文不转义、结尾换行。
  // 少了这条，任何一个写入方用 json.dumps 默认参数就会把全文重排，diff 再次不可读。
  const walk = async (dir) => {
    const out = [];
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, item.name);
      if (item.isDirectory()) out.push(...await walk(full));
      else if (item.name.endsWith(".json")) out.push(full);
    }
    return out;
  };
  const files = await walk(entitiesRoot);
  assert.ok(files.length >= 50, `实体文件应有 50 个以上，实际 ${files.length}`);
  for (const file of files) {
    const text = await readFile(file, "utf8");
    // 判据是「可评审」，不是「与 JS 序列化器逐字节相等」——写入方是 Python，两者对浮点的
    // 写法不同（Python 保留 1.0，JS 归一成 1），拿 JSON.stringify 当基准会误报。
    JSON.parse(text);
    assert.ok(text.endsWith("\n"), `${file} 应以换行结尾`);
    assert.ok(text.includes("\n  "), `${file} 应缩进落盘，而不是挤成一行`);
    // 中文必须直接落盘，否则 diff 全是 \uXXXX 没法读。但控制字符（题干里确实有 ）
    // 是 JSON 规范强制要求转义的，不能一并禁掉。
    const escapes = [...text.matchAll(/\\u([0-9a-f]{4})/gi)].map(m => Number.parseInt(m[1], 16));
    const printableEscapes = escapes.filter(code => code >= 0x20);
    assert.deepEqual(printableEscapes, [], `${file} 把可打印字符转义了，中文应直接落盘`);
  }

  // TS 侧的装配入口是生成的，必须与目录内容一致——漏跑生成器会让应用少读几道题。
  const indexSource = await readFile(new URL("../data/entities/index.ts", import.meta.url), "utf8");
  for (const code of codes) assert.ok(indexSource.includes(`./practical/${code}.json`), `index.ts 缺少 ${code}`);
  const importedPractical = [...indexSource.matchAll(/\.\/practical\/([^"]+)\.json/g)].map(m => m[1]);
  assert.deepEqual(importedPractical.sort(), [...codes].sort(), "index.ts 与 practical 目录不一致");

  // 拼装结果必须与发布产物完全对齐；stats 是推导值，不存储。
  const bank = await assembleBank();
  assert.equal(bank.stats.theoryQuestions, 900);
  assert.equal(bank.stats.practicalTasks, 40);
  const assets = JSON.parse(await readFile(new URL("../data/content-assets.json", import.meta.url), "utf8"));
  assert.equal(assets.version, bank.version);
  const published = JSON.parse(await readFile(new URL(`../public${assets.theory}`, import.meta.url), "utf8"));
  assert.deepEqual(published.questions, bank.theory, "发布的理论题库与实体层不一致");
});
