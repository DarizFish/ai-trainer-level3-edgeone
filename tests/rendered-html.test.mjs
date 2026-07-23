import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

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

test("theory and practical content pages remain public while progress is protected", async () => {
  const publicPages = ["../app/theory/page.tsx", "../app/practical/page.tsx", "../app/theory/mock/page.tsx", "../app/practical/mock/page.tsx"];
  for (const path of publicPages) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /requireAccountUser/);
    assert.doesNotMatch(source, /getAccountUser|searchParams/);
    assert.match(source, /force-static/);
  }
  const progress = await readFile(new URL("../app/progress/page.tsx", import.meta.url), "utf8");
  assert.match(progress, /requireAccountUser/);
});

test("public route shells are static while answer scoring is immediate and persistence is batched", async () => {
  const [layout, theoryRoute, practicalRoute, theoryPractice, theoryAnswer, progressPage, dashboard] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/content/theory/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/content/practical/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/TheoryPractice.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/theory/answer/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/progress/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ProgressDashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(layout, /headers\(\)|getAccountUser/);
  assert.match(layout, /api\/content\/theory/);
  assert.match(theoryRoute, /force-static/);
  assert.match(practicalRoute, /force-static/);
  assert.match(theoryPractice, /const correct = isCorrect\(question, answer\)/);
  assert.match(theoryPractice, /pendingAnswersRef/);
  assert.match(theoryPractice, /setTimeout\(\(\) => flushProgress\(\), 900\)/);
  assert.match(theoryAnswer, /Array\.isArray\(payload\.attempts\)/);
  assert.match(theoryAnswer, /excluded\.attempts/);
  assert.match(progressPage, /initialData=\{progress\}/);
  assert.doesNotMatch(dashboard, /fetch\("\/api\/progress"/);
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
  assert.match(auth, /PASSWORD_ITERATIONS = 100_000/);
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
  const [theory, theoryPage, practicalPage, practical, detail, labPage, workbench, lab, styles] = await Promise.all([
    readFile(new URL("../components/TheoryPractice.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/theory/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/practical/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalCatalog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/practical/[code]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/practical/[code]/lab/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalLabWorkbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/JupyterLiteLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(theory, /practice-question-card/);
  assert.match(theory, /theory-study-nav/);
  assert.match(theory, /theory-study-layout/);
  assert.match(theory, /practice-palette/);
  assert.match(theory, /question-number-grid/);
  assert.match(theory, /theory-builder-panel/);
  assert.match(theory, /useState<Screen>\("practice"\)/);
  assert.match(theory, /选择答案后自动判分/);
  assert.match(theory, /question\.type === "multi"/);
  assert.match(theory, /void submit\(question, answer\)/);
  assert.match(theory, /键盘快捷键/);
  assert.match(theory, /专项组题/);
  assert.match(theory, /题库检索/);
  assert.match(theory, /错题/);
  assert.match(theory, /公开参考题库/);
  assert.match(theory, /本站知识点整理/);
  assert.match(theory, /matchesAnswerFilter/);
  assert.match(theory, /ai-trainer-theory-session-v6/);
  assert.match(theory, /answers\?: Record<string, string\[\]>/);
  assert.match(theory, /feedback\?: Record<string, boolean>/);
  assert.match(theory, /setRevealed\(Object\.fromEntries/);
  assert.match(theory, /answers: sessionAnswers, feedback: sessionFeedback/);
  assert.match(theory, /stored\.contentVersion !== contentVersion/);
  assert.match(theoryPage, /contentVersion=\{content\.version\}/);
  assert.match(theory, /判断题 300 题/);
  assert.match(theory, /单选题 300 题/);
  assert.match(theory, /多选题 300 题/);
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
  assert.match(practical, /task\.materials\[0\]\.label/);
  assert.match(practical, /手册未配套文件/);
  assert.match(practical, /进入实验室/);
  assert.match(practical, /catalog-scope-buttons/);
  assert.match(practical, /hasActiveFilters &&/);
  assert.doesNotMatch(practical, /catalog-navigation|catalog-module-navigation|<select|pagination/);
  assert.match(styles, /\.practical-catalog \{ display: grid; grid-template-columns: 300px minmax\(0, 1fr\);/);
  assert.match(styles, /@media \(max-width: 980px\) \{\s+\.practical-catalog \{ grid-template-columns: 1fr; \}/);
  assert.match(styles, /\.practical-catalog-sidebar \.practical-score-track \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
  assert.match(styles, /\.catalog-results \.card-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(detail, /redirect\(`\/practical\/\$\{task\.code\}\/lab`\)/);
  assert.match(labPage, /lab-context-bar/);
  assert.match(labPage, /PracticalLabWorkbench/);
  assert.doesNotMatch(labPage, /lab-flow-nav/);
  assert.doesNotMatch(labPage, /page-hero|lab-task-instructions/);
  assert.match(workbench, /lab-study-layout/);
  assert.match(workbench, /lab-task-sidebar/);
  assert.match(workbench, /lab-workspace-switcher/);
  assert.match(workbench, /lab-rail-brief/);
  assert.match(workbench, /lab-rail-materials/);
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

test("content and lab manifests contain the complete versioned bank", async () => {
  const content = JSON.parse(await readFile(new URL("../data/content.json", import.meta.url), "utf8"));
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
    readFile(new URL("../data/content.json", import.meta.url), "utf8").then(JSON.parse),
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
    readFile(new URL("../data/content.json", import.meta.url), "utf8").then(JSON.parse),
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
  }
  const officialRetail = helper.createPracticalWordExercise(tasks.find((task) => task.code === "4.2.1"));
  assert.equal(officialRetail.fields[0].referenceAnswer, "会员基本信息、消费记录和积分兑换");
  assert.equal(officialRetail.fields[4].referenceAnswer, "提升业务效率和顾客满意度");
  assert.match(component, /data-word-answer/);
  assert.match(component, /草稿与核分自动保存在当前浏览器/);
  assert.match(component, /未达到 · 0 分/);
  assert.match(component, /达到 · 1 分/);
  assert.match(component, /word-inline-field/);
  assert.match(component, /完成填写，核对答案/);
  assert.match(component, /待补全文档/);
  assert.match(component, /修改填写会撤销对应旧分数/);
  assert.doesNotMatch(component, /fetch\(|scorePractical|rubric:|保存成绩|自评分/);
  assert.match(workspace, /word-answer-first/);
  assert.match(component, /sourceDocument/);
  assert.doesNotMatch(workspace, /showDocumentPreview=\{false\}/);
  assert.doesNotMatch(workspace, /practical-rubric-workspace|RubricAssessment/);
  assert.match(detailPage, /5 处 Word 模板空白/);
  assert.match(detailPage, /userEmail=\{user\?\.email \?\? null\}/);
  assert.match(styles, /\.word-fill-slot/);
  assert.match(styles, /\.word-exercise-document/);
});

test("two-deliverable practical tasks support separate drafting, reference comparison, and completion checks", async () => {
  const [content, helper, component, workspace, styles] = await Promise.all([
    readFile(new URL("../data/content.json", import.meta.url), "utf8").then(JSON.parse),
    import(new URL("../lib/practical-response-exercise.ts", import.meta.url)),
    readFile(new URL("../components/PracticalResponseExercise.tsx", import.meta.url), "utf8"),
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
    assert.ok(exercise.sections.every((section) => section.prompt && section.referenceAnswer && section.outputLabel), task.code);
    assert.deepEqual(exercise.sections.flatMap((section) => section.rubric.map((item) => item.id)), task.rubric.map((item) => item.id), task.code);
    assert.equal(helper.createPracticalResponseExercise({ ...task, hasNotebook: true }), null);
  }
  assert.match(component, /两份 Word 报告/);
  assert.match(component, /data-response-section/);
  assert.match(component, /复盘时才显示答案和评分项/);
  assert.match(component, /PracticalOutcomeCheck/);
  assert.match(component, /已完成全部核对/);
  assert.match(component, /修改本份作答会撤销对应的自评结果/);
  assert.match(component, /ai-trainer-practical-response-v3/);
  assert.match(component, /response-study-rail/);
  assert.match(component, /查看完整官方题面/);
  assert.doesNotMatch(component, /fetch\(|scorePractical|RubricAssessment/);
  assert.match(workspace, /createPracticalResponseExercise/);
  assert.match(workspace, /<PracticalResponseExercise/);
  assert.match(workspace, /createPracticalResponseExercise/);
  assert.match(styles, /\.practical-response-section\.reviewing/);
  assert.match(styles, /\.practical-response-reference/);
});

test("Notebook Word answer sheets appear only where the official task requires a Word document", async () => {
  const [content, helper, references, component, styles] = await Promise.all([
    readFile(new URL("../data/content.json", import.meta.url), "utf8").then(JSON.parse),
    import(new URL("../lib/practical-word-deliverable.ts", import.meta.url)),
    import(new URL("../lib/practical-reference.ts", import.meta.url)),
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
  const reportReference = references.getPracticalReferenceNarrative(content.practical.find((task) => task.code === "2.2.1"));
  assert.match(reportReference, /模型性能/);
  assert.doesNotMatch(reportReference, /import pandas/);
  assert.match(component, /独立的文字交付物，不写入 Notebook/);
  assert.match(component, /截图、HTML、模型与数据文件仍在实验区按原题保存/);
  assert.match(component, /lab-word-reference/);
  assert.match(component, /在当前草稿下方直接对比/);
  assert.match(component, /getPracticalReferenceNarrative/);
  assert.doesNotMatch(component, /type="file"|截图上传|HTML 上传/);
  assert.match(styles, /\.lab-word-deliverable/);
});

test("business-optimization tasks start with the official two-question blank answer sheet", async () => {
  const [content, helper, component, workspace, detailPage, styles] = await Promise.all([
    readFile(new URL("../data/content.json", import.meta.url), "utf8").then(JSON.parse),
    import(new URL("../lib/practical-response-exercise.ts", import.meta.url)),
    readFile(new URL("../components/BusinessAnalysisAnswerSheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/practical/[code]/page.tsx", import.meta.url), "utf8"),
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
  assert.match(workspace, /task\.group === "1\.2"/);
  assert.match(workspace, /business-answer-first/);
  assert.match(workspace, /if \(businessAnswerSheet\) return <BusinessAnalysisAnswerSheet/);
  assert.ok(workspace.indexOf("if (businessAnswerSheet) return") < workspace.indexOf("if (responseExercise) return"));
  assert.match(component, /业务优化答题卷/);
  assert.match(component, /官方考核任务单/);
  assert.match(component, /场地设备要求/);
  assert.match(component, /技能要求/);
  assert.match(component, /质量指标/);
  assert.match(component, /backgroundForAnswerSheet/);
  assert.match(component, /完成作答，进入复盘/);
  assert.match(component, /非官方考场信息/);
  assert.doesNotMatch(component, /官方评分项/);
  assert.match(detailPage, /business-answer-sheet-page/);
  assert.match(detailPage, /两道大题答题卷/);
  assert.match(styles, /\.business-answer-sheet \{/);
  assert.match(styles, /\.business-sheet-paper/);
  assert.match(styles, /\.business-sheet-context/);
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

test("derived theory answers use audited reference and hash-bound editorial snapshots without changing official answers", async () => {
  const [content, reference, editorial, audit, importer, validator, practice] = await Promise.all([
    readFile(new URL("../data/content.json", import.meta.url), "utf8").then(JSON.parse),
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
  assert.equal(basisCounts.third_party_reference.length, 649);
  assert.equal(basisCounts.editorial_review.length, 23);
  assert.equal(basisCounts.heuristic.length, 38);
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
  assert.match(practice, /公开参考题库/);
  assert.match(practice, /本站逐题复核/);
  assert.deepEqual(content.theory.find((question) => question.id === "judge-197").answer, ["√"]);
  assert.deepEqual(content.theory.find((question) => question.id === "judge-216").answer, ["×"]);
  assert.deepEqual(content.theory.find((question) => question.id === "judge-226").answer, ["√"]);
  assert.deepEqual(content.theory.find((question) => question.id === "judge-235").answer, ["×"]);
  assert.deepEqual(content.theory.find((question) => question.id === "judge-243").answer, ["×"]);
});

test("answer provenance uses concrete user-facing sources instead of a generic derived label", async () => {
  const [badge, theory, theoryMock, practical, practicalMock, practicalExamWorkspace, home, layout] = await Promise.all([
    readFile(new URL("../components/SourceBadge.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/TheoryPractice.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/TheoryMock.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalMock.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalExamTaskWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(badge, /答案来源：指导手册/);
  assert.match(badge, /答案来源：公开参考题库/);
  assert.match(badge, /答案来源：本站逐题复核/);
  assert.match(badge, /答案来源：本站知识点整理/);
  assert.match(badge, /参考依据：配套完成版 Notebook/);
  assert.match(badge, /参考依据：官方数据集实算/);
  assert.match(badge, /参考依据：官方模板填写示例/);
  assert.match(badge, /参考依据：题干与官方评分表/);
  assert.match(badge, /参考依据：官方评分表整理/);
  assert.match(practical, /basis=\{task\.answerBasis\}/);
  assert.match(practicalMock, /PracticalExamTaskWorkspace/);
  assert.match(practicalExamWorkspace, /basis=\{task\.answerBasis\}/);
  assert.match(theoryMock, /basis=\{item\.answerBasis\}/);
  assert.match(home, /答案占位括号只按受限规则规范化/);
  assert.match(home, /逐题复核并绑定内容哈希/);
  assert.match(layout, /每道答案标明具体来源/);
  assert.doesNotMatch(`${badge}${theory}${practical}${practicalMock}${practicalExamWorkspace}${home}${layout}`, /资料推导|未核对推导|规则推导|评分细则推导/);
});

test("official Word templates expose hash-bound fill examples for every blank", async () => {
  const [content, snapshot, importer, validator] = await Promise.all([
    readFile(new URL("../data/content.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/references/practical-template-answers-2026-07-17.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../scripts/import-reference.py", import.meta.url), "utf8"),
    readFile(new URL("../scripts/validate-content.py", import.meta.url), "utf8"),
  ]);
  assert.deepEqual(content.practicalTemplateReferences, {
    snapshotVersion: "2026-07-17-v1",
    capturedAt: "2026-07-17",
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
    assert.match(task.referenceAnswer, /官方 Word 模板填写示例（5 处空白）/, entry.code);
    assert.doesNotMatch(task.referenceAnswer, /建议答案应完整覆盖以下评分点/, entry.code);
    assert.equal(entry.fills.length, entry.template.blankCount, entry.code);
    for (const fill of entry.fills) assert.match(task.referenceAnswer, new RegExp(fill.answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), entry.code);
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
    readFile(new URL("../data/content.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/references/practical-rubric-answers-2026-07-17.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../scripts/import-reference.py", import.meta.url), "utf8"),
    readFile(new URL("../scripts/validate-content.py", import.meta.url), "utf8"),
  ]);
  assert.deepEqual(content.practicalRubricReferences, {
    snapshotVersion: "2026-07-17-v1",
    capturedAt: "2026-07-17",
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
    assert.ok(task.referenceAnswer.length > 600, entry.code);
    assert.doesNotMatch(task.referenceAnswer, /建议答案应完整覆盖以下评分点/, entry.code);
    assert.deepEqual(new Set(Object.keys(entry.rubricCoverage)), new Set(task.rubric.map((item) => item.id)), entry.code);
    for (const item of task.rubric) assert.match(task.referenceAnswer, new RegExp(item.id), entry.code);
  }
  assert.match(byCode.get("1.2.2").referenceAnswer, /不替代医疗诊断/);
  assert.match(byCode.get("1.2.4").referenceAnswer, /不自动发布/);
  assert.match(byCode.get("1.2.5").referenceAnswer, /用户授权/);
  assert.match(importer, /apply_rubric_answers/);
  assert.match(validator, /rubricCoverage/);
});

test("all Python practical tasks expose audited completed-notebook reference code", async () => {
  const [content, snapshot, audit, importer, lab, bridgeExtension] = await Promise.all([
    readFile(new URL("../data/content.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/references/notebook-solutions-2026-07-16.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/references/notebook-solution-audit.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../scripts/import-reference.py", import.meta.url), "utf8"),
    readFile(new URL("../components/JupyterLiteLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../jupyterlite-extension/src/index.ts", import.meta.url), "utf8"),
  ]);
  const tasks = content.practical.filter(task => task.hasNotebook);
  assert.equal(content.version, "2026-07-19-v7");
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
  assert.match(bridgeExtension, /不自动判对错/);
  assert.doesNotMatch(lab, /下载完整参考代码|SourceBadge/);
});

test("official practical answers stop at their Word answer boundary", async () => {
  const [content, importer] = await Promise.all([
    readFile(new URL("../data/content.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../scripts/import-reference.py", import.meta.url), "utf8"),
  ]);
  const official = content.practical.filter(task => task.answerSource === "official");
  assert.equal(official.length, 6);
  for (const task of official) {
    assert.ok(task.referenceAnswer.trim(), task.code);
    assert.doesNotMatch(task.referenceAnswer, /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/, task.code);
    assert.doesNotMatch(task.referenceAnswer, /人工智能训练师（三级）操作技能考核|试题单|试题代码：|试题名称：/, task.code);
  }
  assert.match(importer, /clean_official_practical_answer/);
  assert.match(importer, /Missing official practical answer/);
});

test("exam entry pages expose their start controls from a compact workspace", async () => {
  const [theoryPage, practicalPage, theoryMock, practicalMock] = await Promise.all([
    readFile(new URL("../app/theory/mock/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/practical/mock/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/TheoryMock.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PracticalMock.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(theoryPage, /mock-page-head/);
  assert.match(practicalPage, /mock-page-head/);
  assert.doesNotMatch(`${theoryPage}${practicalPage}`, /page-hero/);
  assert.match(theoryMock, /container mock-entry/);
  assert.match(practicalMock, /container mock-entry/);
});

test("official exam blueprint is centralized and both mock exams use persistent deadline-based sessions", async () => {
  const [blueprint, blueprintPage, theoryMock, practicalMock, theoryApi, scoring, lab, workbench, theoryStorage, practicalStorage] = await Promise.all([
    readFile(new URL("../lib/exam-blueprint.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/blueprint/page.tsx", import.meta.url), "utf8"),
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
  assert.match(blueprintPage, /两科分别判定/);
  assert.match(blueprintPage, /可只补考该科/);
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
    readFile(new URL("../data/content.json", import.meta.url), "utf8").then(JSON.parse),
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
    readFile(new URL("../data/content.json", import.meta.url), "utf8").then(JSON.parse),
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
  assert.match(practicalApi, /await db\.transaction/);
  assert.match(practicalApi, /await transaction\.insert/);
  assert.match(practicalApi, /Object\.fromEntries/);
  assert.match(practicalApi, /scorePractical/);
  assert.match(practicalApi, /await db\.insert/);
  assert.match(page, /contentVersion=\{content\.version\}/);
});

test("progress reports theory and practical readiness separately using official practical weights", async () => {
  const [progressApi, dashboard] = await Promise.all([
    readFile(new URL("../app/api/progress/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/ProgressDashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(progressApi, /practicalAbility/);
  assert.match(progressApi, /estimatedPracticalScore/);
  assert.match(dashboard, /theoryPassed/);
  assert.match(dashboard, /practicalPassed/);
  assert.match(dashboard, /两科分别判定/);
  assert.match(dashboard, /不计算综合平均分|分别达到 60 分/);
  assert.match(dashboard, /实操官方权重/);
});

test("starter preview is fully removed and social metadata asset exists", async () => {
  const [layout, packageJson, og] = await Promise.all([readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"), readFile(new URL("../package.json", import.meta.url), "utf8"), readFile(new URL("../public/og.png", import.meta.url))]);
  assert.doesNotMatch(layout, /codex-preview|_sites-preview|Starter Project/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.ok(og.length > 100_000);
});

test("JupyterLite ships isolated task workspaces, all notebooks, local runtimes, and both site bridge extensions", async () => {
  const [content, lite, host, labShell, configUtils, bridgeExtension, bridgePackage, buildScript, extensionBuildScript, runtimeCopyScript, packageJson] = await Promise.all([
    readFile(new URL("../data/content.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/lite/jupyter-lite.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../components/JupyterLiteLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/lite/lab/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/lite/config-utils.js", import.meta.url), "utf8"),
    readFile(new URL("../jupyterlite-extension/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../jupyterlite-extension/package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../scripts/build-jupyterlite.ps1", import.meta.url), "utf8"),
    readFile(new URL("../scripts/build-jupyterlite-extension.ps1", import.meta.url), "utf8"),
    readFile(new URL("../scripts/copy-onnxruntime-web.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  const extensions = lite["jupyter-config-data"].federated_extensions;
  const notebookOverrides = lite["jupyter-config-data"].settingsOverrides["@jupyterlab/notebook-extension:tracker"];
  assert.equal(lite["jupyter-config-data"].appUrl, "./lab");
  assert.equal(notebookOverrides.autoStartDefaultKernel, true);
  assert.equal(Object.hasOwn(notebookOverrides, "autoStartDefault"), false);
  assert.match(labShell, /build\/lab\/bundle\.js/);
  assert.match(labShell, /data-notebook="lab"/);
  assert.match(host, /workspace=\$\{workspaceSlug\}-embed/);
  assert.match(host, /20260722-runtime6/);
  assert.match(host, /path: notebookPath/);
  assert.match(configUtils, /applyQueryOverrides/);
  assert.match(configUtils, /config\.workspace = workspace/);
  assert.match(bridgeExtension, /kernelStarts/);
  assert.match(bridgeExtension, /IKernelSpecs/);
  assert.match(bridgeExtension, /kernelSpecs\.specs/);
  assert.doesNotMatch(bridgeExtension, /sessionContext\.ready/);
  assert.match(bridgeExtension, /ai-trainer:prepare-exercise/);
  assert.match(bridgeExtension, /NotebookActions\.runCells/);
  assert.match(bridgeExtension, /ai-trainer-onnx/);
  assert.match(bridgeExtension, /scrollToCell/);
  assert.match(bridgeExtension, /collapseLeft/);
  assert.match(bridgeExtension, /hideInfrastructureCells/);
  assert.match(bridgeExtension, /ai-trainer:set-fill-review/);
  assert.match(bridgeExtension, /FillReferenceWidget/);
  assert.match(bridgeExtension, /Decoration\.widget/);
  assert.match(bridgeExtension, /不自动判对错/);
  assert.match(bridgeExtension, /if \(examMode\) return \{ ok: false, count: 0 \}/);
  assert.match(bridgeExtension, /data\.path|path: panel\.context\.path/);
  assert.doesNotMatch(bridgeExtension, /kernelBootstrap/);
  assert.match(buildScript, /patch-jupyterlite-config\.py/);
  assert.match(buildScript, /JUPYTERLITE_PYTHON/);
  assert.match(buildScript, /jupyterlite_core\.app/);
  assert.match(buildScript, /labs:runtime/);
  assert.match(extensionBuildScript, /ItemType Junction/);
  assert.match(extensionBuildScript, /jupyterlite-extension/);
  assert.equal(bridgePackage.dependencies["@jupyterlite/services"], "0.8.1");
  assert.deepEqual(bridgePackage.jupyterlab.sharedPackages["@jupyterlite/services"], { bundled: false, singleton: true });
  assert.equal(packageJson.dependencies["onnxruntime-web"], "1.27.0");
  assert.match(runtimeCopyScript, /Expected onnxruntime-web/);
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
  for (const task of tasks) {
    const notebookSource = await readFile(new URL(`../public/lite/files/${task.code}/${task.code}.ipynb`, import.meta.url), "utf8");
    const notebook = JSON.parse(notebookSource);
    assert.equal(notebook.metadata.ai_trainer.task_code, task.code);
    assert.equal(notebook.metadata.ai_trainer.runtime, "jupyterlite-pyodide");
    assert.equal(notebook.metadata.ai_trainer.visible_content, "original-code-only");
    assert.ok(notebook.cells.some(cell => cell.metadata?.tags?.includes("ai-trainer-setup")));
    const visibleCells = notebook.cells.filter(cell => !cell.metadata?.tags?.some(tag => tag === "ai-trainer-setup" || tag === "ai-trainer-onnx"));
    assert.ok(visibleCells.every(cell => cell.cell_type === "code"));
    assert.deepEqual(visibleCells.map(cell => cell.source.join("")), task.notebook.cells.map(cell => cell.source));
    assert.doesNotMatch(notebookSource, /## 使用方法|## 评分点|ai-trainer-intro|ai-trainer-exercise-heading/);
    const isOnnx = notebook.cells.some(cell => cell.metadata?.tags?.includes("ai-trainer-onnx"));
    onnxNotebooks += Number(isOnnx);
    if (isOnnx) {
      assert.match(notebookSource, /\/labs\/runtime\/onnxruntime-web\/1\.27\.0\//);
      assert.match(notebookSource, /ort\.wasm\.bundle\.min\.mjs/);
      assert.doesNotMatch(notebookSource, /cdn\.jsdelivr\.net/);
    }
  }
  assert.equal(onnxNotebooks, 5);

  const onnxRuntimeFiles = {
    "ort.wasm.bundle.min.mjs": "1db5e1c5cd2b860eed85e6eeff23e2aaa7cffcc407f67093bcc888f631b94ba9",
    "ort-wasm-simd-threaded.mjs": "0a1e718d99c41b22c21f2520ff4f9e883a6b5533856e398d21816ee8eb8185d3",
    "ort-wasm-simd-threaded.wasm": "d1ab1b94b16a65b29d710d0b587b29e7bed336827577623913479b8afe8113e6",
  };
  for (const [name, expectedHash] of Object.entries(onnxRuntimeFiles)) {
    const payload = await readFile(new URL(`../public/labs/runtime/onnxruntime-web/1.27.0/${name}`, import.meta.url));
    assert.equal(createHash("sha256").update(payload).digest("hex"), expectedHash, `${name} has an invalid runtime hash`);
  }
  assert.match(host, /ai-trainer:get-notebook/);
  assert.match(host, /ai-trainer:set-notebook/);
  assert.match(host, /notebook:run-all-cells/);
  assert.match(host, /\/lite\/lab\/index\.html/);

  // These lazy shared chunks are required during JupyterLab startup. The
  // JupyterLite shared-package pruning option incorrectly removes them.
  for (const chunk of [
    "1263.041eafb.js",
    "1295.0f4010f.js",
    "1415.ef78602.js",
    "2539.75c809c.js",
    "3687.198294e.js",
    "3846.3e60f7b.js",
    "4083.21af322.js",
    "4396.cf059f5.js",
    "5961.a12a880.js",
    "7253.5262743.js",
    "8838.6d34eed.js",
  ]) {
    await readFile(new URL(`../public/lite/build/${chunk}`, import.meta.url));
  }

  // The Pyodide core archive includes package metadata, but not the wheels
  // required by either the kernel or the practical notebooks. Keep the full
  // compiled dependency closure local and verify it against Pyodide's lock.
  const pyodideLock = JSON.parse(await readFile(new URL("../public/lite/static/pyodide/pyodide-lock.json", import.meta.url), "utf8"));
  const normalizePackageName = name => name.toLowerCase().replaceAll("_", "-").replaceAll(".", "-");
  const packages = new Map(Object.entries(pyodideLock.packages).map(([name, metadata]) => [normalizePackageName(name), metadata]));
  const queue = ["micropip", "ipython", "jedi", "numpy", "pandas", "matplotlib", "scipy", "scikit-learn", "pillow"];
  const required = new Set();
  while (queue.length > 0) {
    const name = normalizePackageName(queue.pop());
    if (required.has(name)) continue;
    required.add(name);
    const metadata = packages.get(name);
    assert.ok(metadata, `Pyodide lock metadata is missing ${name}`);
    queue.push(...metadata.depends);
  }
  assert.equal(required.size, 31);
  for (const name of required) {
    const metadata = packages.get(name);
    const wheel = await readFile(new URL(`../public/lite/static/pyodide/${metadata.file_name}`, import.meta.url));
    assert.equal(createHash("sha256").update(wheel).digest("hex"), metadata.sha256, `${name} has an invalid or stale wheel`);
  }

  // Packages missing from the Pyodide lock are pinned as local pure-Python
  // wheels, so Notebook setup never silently succeeds without installing them.
  const pipliteIndex = JSON.parse(await readFile(new URL("../public/lite/pypi/all.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(pipliteIndex).sort(), ["et-xmlfile", "imbalanced-learn", "openpyxl", "seaborn"]);
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
