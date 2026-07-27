import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, cp, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const publishScript = fileURLToPath(new URL("../scripts/publish_theory_review.py", import.meta.url));
const stateScript = fileURLToPath(new URL("../scripts/theory_review_state.py", import.meta.url));
const qualityScript = fileURLToPath(new URL("../scripts/theory_review_quality.py", import.meta.url));
const sourceContent = fileURLToPath(new URL("../data/content.json", import.meta.url));
const sourceReference = fileURLToPath(
  new URL("../data/references/theory-question-bank-2026-07-16.json", import.meta.url),
);
const sourceReferenceAudit = fileURLToPath(
  new URL("../data/references/theory-reference-audit.json", import.meta.url),
);
const pythonExecutable = process.env.PYTHON_EXECUTABLE || "python";

function runPython(script, args) {
  return spawnSync(pythonExecutable, [script, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
  });
}

function assertSuccess(result) {
  assert.equal(
    result.status,
    0,
    `command failed: ${result.error ?? ""}\n${result.stdout}\n${result.stderr}`,
  );
  return JSON.parse(result.stdout);
}

function sortedCounts(values) {
  const counts = new Map();
  for (const value of values) {
    const key = String(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function buildSummary(entries) {
  return {
    total: entries.length,
    byQuestionType: sortedCounts(entries.map((entry) => entry.questionType)),
    byProcessingStatus: sortedCounts(entries.map((entry) => entry.processingStatus)),
    byOfficialWordMatch: sortedCounts(entries.map((entry) => entry.officialWordMatch.status)),
    bySecondarySiteMatch: sortedCounts(entries.map((entry) => entry.secondarySiteMatch.status)),
    byAdoptedBasis: sortedCounts(entries.map((entry) => entry.adoptedBasis.source)),
    byConflictStatus: sortedCounts(entries.map((entry) => entry.conflict.status)),
    byExplanationGenerationStatus: sortedCounts(
      entries.map((entry) => entry.explanationGenerationStatus),
    ),
    reviewed: entries.filter((entry) => entry.processingStatus === "reviewed").length,
    remaining: entries.filter((entry) => entry.processingStatus !== "reviewed").length,
  };
}

function sameAnswer(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, payload) {
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function mutateState(fixtureRoot, mutator) {
  const stateDir = join(fixtureRoot, "state");
  const manifestPath = join(stateDir, "manifest.json");
  const manifest = await readJson(manifestPath);
  const shards = [];
  const entries = [];
  for (const descriptor of manifest.shards) {
    const path = join(stateDir, descriptor.path);
    const shard = await readJson(path);
    shards.push({ path, shard });
    entries.push(...shard.questions);
  }
  await mutator(entries, manifest);
  for (const { path, shard } of shards) {
    shard.updatedAt = "2026-07-26T00:00:00Z";
    await writeJson(path, shard);
  }
  manifest.updatedAt = "2026-07-26T00:00:00Z";
  manifest.summary = buildSummary(entries);
  await writeJson(manifestPath, manifest);
}

async function makeCompleteFixture(root) {
  await mkdir(root, { recursive: true });
  const content = join(root, "content.json");
  const reference = join(root, "reference.json");
  const referenceAudit = join(root, "reference-audit.json");
  const stateDir = join(root, "state");
  await copyFile(sourceContent, content);
  const unpublishedContent = await readJson(content);
  delete unpublishedContent.theoryReview;
  await writeJson(content, unpublishedContent);
  await copyFile(sourceReference, reference);
  await copyFile(sourceReferenceAudit, referenceAudit);
  assertSuccess(
    runPython(stateScript, [
      "sync",
      "--content",
      content,
      "--reference",
      reference,
      "--audit",
      referenceAudit,
      "--state-dir",
      stateDir,
    ]),
  );
  await mutateState(root, (entries, manifest) => {
    for (const entry of entries) {
      let adoptedSource;
      let reviewedAnswer;
      if (entry.officialWordMatch.status === "matched") {
        adoptedSource = "official_word";
        reviewedAnswer = entry.officialWordMatch.answer;
      } else if (entry.secondarySiteMatch.status === "matched") {
        adoptedSource = "secondary_site";
        reviewedAnswer = entry.secondarySiteMatch.answer;
      } else {
        adoptedSource = "independent_review";
        reviewedAnswer = entry.currentAnswer;
      }
      entry.processingStatus = "reviewed";
      entry.reviewedAnswer = [...reviewedAnswer];
      entry.explanationGenerationStatus = "reviewed";
      entry.generatedExplanation =
        `针对${entry.questionId}的独立临时解析说明：正确选项满足题干中的关键定义和条件，` +
        (entry.questionType === "multi"
          ? "A、B、C、D、E 均已逐项核对，未选项分别混淆了概念层级、适用范围或处理阶段。"
          : "其他选项分别混淆了概念层级、适用范围或处理阶段。");
      entry.reviewedAt = "2026-07-26T00:00:00Z";
      entry.reviewedBy = "publisher-fixture";
      entry.lastUpdatedAt = "2026-07-26T00:00:00Z";
      entry.adoptedBasis.source = adoptedSource;
      entry.adoptedBasis.contentAnswerBasis =
        adoptedSource === "official_word"
          ? "manual_official"
          : adoptedSource === "secondary_site"
            ? "third_party_reference"
            : "editorial_review";
      entry.adoptedBasis.decisionStatus = "confirmed";
      entry.adoptedBasis.evidence.independentReview = adoptedSource === "independent_review";
      if (entry.conflict.status === "open") {
        entry.conflict.status = "resolved";
      }
      assert.ok(
        entry.officialWordMatch.status !== "matched" ||
          sameAnswer(entry.reviewedAnswer, entry.officialWordMatch.answer),
      );
    }
    manifest.appliedBatches.push(
      ...manifest.shards.map((descriptor) => ({
        batchId: "publisher-fixture-generation",
        shardId: descriptor.id,
        inputSha256: createHash("sha256").update(`generation:${descriptor.id}`).digest("hex"),
        appliedAt: "2026-07-25T23:00:00Z",
        count: 100,
        reviewStage: "generation",
        reviewers: ["publisher-generation-fixture"],
      })),
      ...manifest.shards.map((descriptor) => ({
        batchId: "publisher-fixture-cross-review",
        shardId: descriptor.id,
        inputSha256: createHash("sha256").update(`qa:${descriptor.id}`).digest("hex"),
        appliedAt: "2026-07-26T00:00:00Z",
        count: 100,
        reviewStage: "qa",
        reviewers: ["publisher-qa-fixture"],
      })),
    );
  });
  return { content, reference, referenceAudit, stateDir, audit: join(root, "publish-audit.json") };
}

function publisherArgs(fixture, dryRun = false) {
  return [
    "--content",
    fixture.content,
    "--reference",
    fixture.reference,
    "--reference-audit",
    fixture.referenceAudit,
    "--state-dir",
    fixture.stateDir,
    "--output-audit",
    fixture.audit,
    ...(dryRun ? ["--dry-run"] : []),
  ];
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("theory review publisher gates completeness and publishes only to temporary fixtures", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "theory-review-publisher-"));
  try {
    const baseRoot = join(temporaryRoot, "base");
    await makeCompleteFixture(baseRoot);

    const incompleteRoot = join(temporaryRoot, "incomplete");
    await cp(baseRoot, incompleteRoot, { recursive: true });
    const incomplete = {
      content: join(incompleteRoot, "content.json"),
      reference: join(incompleteRoot, "reference.json"),
      referenceAudit: join(incompleteRoot, "reference-audit.json"),
      stateDir: join(incompleteRoot, "state"),
      audit: join(incompleteRoot, "publish-audit.json"),
    };
    await mutateState(incompleteRoot, (entries) => {
      const entry = entries[0];
      entry.processingStatus = "pending";
      entry.reviewedAnswer = null;
      entry.explanationGenerationStatus = "pending";
      entry.generatedExplanation = null;
      entry.reviewedAt = null;
      entry.reviewedBy = null;
    });
    const incompleteBefore = await readFile(incomplete.content);
    const incompleteResult = runPython(publishScript, publisherArgs(incomplete, true));
    assert.notEqual(incompleteResult.status, 0, "dry-run must reject an incomplete ledger");
    assert.match(incompleteResult.stderr, /899\/900|尚未全部生成|未完成答案审校/);
    assert.deepEqual(await readFile(incomplete.content), incompleteBefore);
    assert.equal(await pathExists(incomplete.audit), false);

    const officialChangeRoot = join(temporaryRoot, "official-change");
    await cp(baseRoot, officialChangeRoot, { recursive: true });
    const officialChange = {
      content: join(officialChangeRoot, "content.json"),
      reference: join(officialChangeRoot, "reference.json"),
      referenceAudit: join(officialChangeRoot, "reference-audit.json"),
      stateDir: join(officialChangeRoot, "state"),
      audit: join(officialChangeRoot, "publish-audit.json"),
    };
    await mutateState(officialChangeRoot, (entries) => {
      const entry = entries.find((item) => item.officialWordMatch.status === "matched");
      assert.ok(entry);
      if (entry.questionType === "judge") {
        entry.reviewedAnswer = [entry.officialWordMatch.answer[0] === "√" ? "×" : "√"];
      } else {
        entry.reviewedAnswer = [entry.officialWordMatch.answer[0] === "A" ? "B" : "A"];
      }
    });
    const officialResult = runPython(publishScript, publisherArgs(officialChange, true));
    assert.notEqual(officialResult.status, 0, "official answers must be immutable");
    assert.match(officialResult.stderr, /judge-\d{3}|single-\d{3}|multi-\d{3}|Word/);

    const forbiddenRoot = join(temporaryRoot, "forbidden");
    await cp(baseRoot, forbiddenRoot, { recursive: true });
    const forbidden = {
      content: join(forbiddenRoot, "content.json"),
      reference: join(forbiddenRoot, "reference.json"),
      referenceAudit: join(forbiddenRoot, "reference-audit.json"),
      stateDir: join(forbiddenRoot, "state"),
      audit: join(forbiddenRoot, "publish-audit.json"),
    };
    await mutateState(forbiddenRoot, (entries) => {
      const entry = entries.find((item) => item.officialWordMatch.status !== "matched");
      assert.ok(entry);
      entry.adoptedBasis.source = "heuristic";
      entry.adoptedBasis.contentAnswerBasis = "heuristic";
      entry.adoptedBasis.decisionStatus = "confirmed";
    });
    const forbiddenResult = runPython(publishScript, publisherArgs(forbidden, true));
    assert.notEqual(forbiddenResult.status, 0, "heuristic basis must be rejected");
    assert.match(forbiddenResult.stderr, /heuristic\/unresolved|禁止发布依据/);

    const publishRoot = join(temporaryRoot, "publish");
    await cp(baseRoot, publishRoot, { recursive: true });
    const fixture = {
      content: join(publishRoot, "content.json"),
      reference: join(publishRoot, "reference.json"),
      referenceAudit: join(publishRoot, "reference-audit.json"),
      stateDir: join(publishRoot, "state"),
      audit: join(publishRoot, "publish-audit.json"),
    };
    const beforeDryRun = await readFile(fixture.content);
    const protectedAuditBefore = await readFile(fixture.referenceAudit);
    const protectedAuditResult = runPython(
      publishScript,
      publisherArgs({ ...fixture, audit: fixture.referenceAudit }, true),
    );
    assert.notEqual(protectedAuditResult.status, 0, "reference audit must never be overwritten");
    assert.deepEqual(await readFile(fixture.referenceAudit), protectedAuditBefore);
    const dryRun = assertSuccess(runPython(publishScript, publisherArgs(fixture, true)));
    assert.equal(dryRun.published, false);
    assert.equal(dryRun.dryRun, true);
    assert.equal(dryRun.reviewedQuestions, 900);
    assert.equal(dryRun.independentExplanations, 900);
    assert.equal(dryRun.crossReviewedQuestions, 900);
    assert.deepEqual(await readFile(fixture.content), beforeDryRun);
    assert.equal(await pathExists(fixture.audit), false);

    const publishedResult = assertSuccess(runPython(publishScript, publisherArgs(fixture)));
    assert.equal(publishedResult.published, true);
    assert.equal(publishedResult.version, "2026-07-26-v8");
    const publishedContent = await readJson(fixture.content);
    const audit = await readJson(fixture.audit);
    assert.equal(publishedContent.version, "2026-07-26-v8");
    assert.equal(publishedContent.theoryReview.batchId, "theory-900-review-2026-07-26-v1");
    assert.equal(publishedContent.theoryReview.reviewedQuestions, 900);
    assert.equal(publishedContent.theoryReview.independentExplanations, 900);
    assert.equal(publishedContent.theoryReview.crossReviewedQuestions, 900);
    assert.equal(publishedContent.theoryReview.crossReviewShards, 9);
    assert.equal(publishedContent.theoryReview.officialAnswerChanges, 0);
    assert.equal(publishedContent.theoryReference.appliedDerivedAnswers, 649);
    assert.equal(publishedContent.theoryReference.unmatchedDerivedAnswers, 61);
    assert.equal(publishedContent.theoryReference.editorialReviewedAnswers, 23);
    assert.equal(publishedContent.theoryReference.remainingHeuristicAnswers, 0);
    assert.equal(
      Object.values(publishedContent.theoryReview.basisCounts).reduce(
        (sum, count) => sum + count,
        0,
      ),
      900,
    );
    assert.equal(
      publishedContent.theory.some((question) =>
        ["heuristic", "unresolved"].includes(question.answerBasis),
      ),
      false,
    );
    assert.equal(audit.answerChanges.officialAnswerChanges, 0);
    assert.equal(audit.explanations.total, 900);
    assert.equal(audit.explanations.crossReviewed, 900);
    assert.equal(audit.explanations.duplicateGroups.length, 0);
    assert.equal(audit.shards.length, 9);
    assert.equal(
      audit.shards.reduce((sum, shard) => sum + shard.count, 0),
      900,
    );
    for (const value of Object.values(audit.sourceHashes)) {
      if (value !== null) assert.match(value, /^[0-9a-f]{64}$/);
    }
    const publishedBytes = await readFile(fixture.content);
    assert.equal(
      audit.output.publishedContentSha256,
      createHash("sha256").update(publishedBytes).digest("hex"),
    );

    const postPublishState = assertSuccess(
      runPython(stateScript, [
        "validate",
        "--content",
        fixture.content,
        "--reference",
        fixture.reference,
        "--audit",
        fixture.referenceAudit,
        "--state-dir",
        fixture.stateDir,
      ]),
    );
    assert.equal(postPublishState.summary.reviewed, 900);
    const postPublishQuality = assertSuccess(
      runPython(qualityScript, [
        "--content",
        fixture.content,
        "--reference",
        fixture.reference,
        "--audit",
        fixture.referenceAudit,
        "--state-dir",
        fixture.stateDir,
        "--require-complete",
      ]),
    );
    assert.equal(postPublishQuality.crossReviewedExplanations, 900);
    const manifestPath = join(fixture.stateDir, "manifest.json");
    const manifestBeforeSync = await readFile(manifestPath);
    assertSuccess(
      runPython(stateScript, [
        "sync",
        "--content",
        fixture.content,
        "--reference",
        fixture.reference,
        "--audit",
        fixture.referenceAudit,
        "--state-dir",
        fixture.stateDir,
      ]),
    );
    assert.deepEqual(await readFile(manifestPath), manifestBeforeSync);
    const publishedBeforeRepeat = await readFile(fixture.content);
    const repeatPublish = runPython(publishScript, publisherArgs(fixture, true));
    assert.notEqual(repeatPublish.status, 0, "the same review batch must not be republished");
    assert.match(repeatPublish.stderr, /theory-900-review-2026-07-26-v1/);
    assert.deepEqual(await readFile(fixture.content), publishedBeforeRepeat);

    // 发布封条绑定的是整份 content 文件，实操素材同步这类与理论审校无关的改动也会
    // 让它失效，而重新发布是被拒绝的。--restamp 先按首次发布的时间戳确定性重建一
    // 次发布结果，逐字段比对理论审校写入的键，全部一致才把封条挪到当前文件上。
    const auditBeforeRestamp = await readJson(fixture.audit);
    const contentForRestamp = await readJson(fixture.content);
    contentForRestamp.practical = [{ code: "9.9.9", note: "restamp fixture" }];
    await writeJson(fixture.content, contentForRestamp);
    const restamped = assertSuccess(
      runPython(publishScript, [...publisherArgs(fixture), "--restamp"]),
    );
    assert.equal(restamped.restamped, true);
    assert.equal(restamped.previousSha256, auditBeforeRestamp.output.publishedContentSha256);
    const auditAfterRestamp = await readJson(fixture.audit);
    assert.equal(
      auditAfterRestamp.output.publishedContentSha256,
      createHash("sha256").update(await readFile(fixture.content)).digest("hex"),
    );
    assert.equal(
      auditAfterRestamp.output.restampedFrom,
      auditBeforeRestamp.output.publishedContentSha256,
    );

    // 理论审校范围内的漂移必须被拒绝，并指名具体字段。
    const tamperedContent = await readJson(fixture.content);
    tamperedContent.stats.theoryQuestions = 1;
    await writeJson(fixture.content, tamperedContent);
    const refusedRestamp = runPython(publishScript, [...publisherArgs(fixture), "--restamp"]);
    assert.notEqual(refusedRestamp.status, 0, "theory-scope drift must not be restamped");
    assert.match(refusedRestamp.stderr, /stats\.theoryQuestions/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
