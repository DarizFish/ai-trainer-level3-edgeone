import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = new URL("../", import.meta.url);
const stateRoot = new URL("../data/references/theory-review-state/", import.meta.url);
const scriptPath = new URL("../scripts/theory_review_state.py", import.meta.url);
const pythonExecutable = process.env.PYTHON_EXECUTABLE || "python";

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

function spawnReviewState(args) {
  return spawnSync(pythonExecutable, [fileURLToPath(scriptPath), ...args], {
    cwd: fileURLToPath(projectRoot),
    encoding: "utf8",
  });
}

function runReviewState(args) {
  const result = spawnReviewState(args);
  assert.equal(result.status, 0, `command failed: ${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

test("theory review ledger covers all 900 questions with explicit evidence and workflow state", async () => {
  const manifest = await readJson(new URL("manifest.json", stateRoot));
  assert.equal(manifest.schemaVersion, "1.0.0");
  assert.equal(manifest.batchId, "theory-900-review-2026-07-26-v1");
  assert.deepEqual(manifest.policy.answerPriority, ["official_word", "secondary_site", "independent_review"]);
  assert.equal(manifest.policy.explanationPolicy, "independent_generation_only");
  assert.equal(manifest.shards.length, 9);
  assert.equal(manifest.summary.total, 900);
  assert.deepEqual(manifest.summary.byQuestionType, { judge: 300, multi: 300, single: 300 });
  assert.deepEqual(manifest.summary.byOfficialWordMatch, { matched: 190, not_found: 710 });
  assert.deepEqual(manifest.summary.bySecondarySiteMatch, { matched: 830, not_matched: 70 });
  assert.equal(manifest.summary.byConflictStatus.none, 895);
  assert.equal(
    (manifest.summary.byConflictStatus.open ?? 0) + (manifest.summary.byConflictStatus.resolved ?? 0),
    5,
  );
  assert.equal(
    Object.values(manifest.summary.byExplanationGenerationStatus).reduce((sum, count) => sum + count, 0),
    900,
  );

  const entries = [];
  for (const descriptor of manifest.shards) {
    const shard = await readJson(new URL(descriptor.path, stateRoot));
    assert.equal(shard.questions.length, 100);
    assert.equal(shard.questionType, descriptor.questionType);
    entries.push(...shard.questions);
  }
  assert.equal(entries.length, 900);
  assert.equal(new Set(entries.map((entry) => entry.questionId)).size, 900);

  const requiredFields = [
    "questionId",
    "questionType",
    "processingStatus",
    "currentAnswer",
    "reviewedAnswer",
    "officialWordMatch",
    "secondarySiteMatch",
    "adoptedBasis",
    "conflict",
    "explanationGenerationStatus",
    "generatedExplanation",
    "reviewedAt",
  ];
  for (const entry of entries) {
    for (const field of requiredFields) {
      assert.ok(Object.hasOwn(entry, field), `${entry.questionId} missing ${field}`);
    }
    assert.match(entry.questionFingerprint, /^[0-9a-f]{64}$/);
    assert.match(entry.evidenceFingerprint, /^[0-9a-f]{64}$/);
    if (entry.explanationGenerationStatus === "pending") {
      assert.equal(entry.generatedExplanation, null);
    } else {
      assert.ok(entry.generatedExplanation?.trim(), `${entry.questionId} missing generated explanation`);
    }
    if (entry.processingStatus === "reviewed") {
      assert.ok(entry.reviewedAnswer?.length, `${entry.questionId} missing reviewed answer`);
      assert.ok(entry.reviewedAt, `${entry.questionId} missing review timestamp`);
    }
    assert.ok(!Object.hasOwn(entry, "explanation"), `${entry.questionId} must not copy an existing explanation`);
    assert.equal(entry.notes.length, new Set(entry.notes).size, `${entry.questionId} has duplicate notes`);
  }
});

test("review state schema names every required per-question field", async () => {
  const schema = await readJson(new URL("../data/references/theory-review-state.schema.json", import.meta.url));
  const batchSchema = await readJson(new URL("../data/references/theory-review-batch.schema.json", import.meta.url));
  const required = schema.$defs.questionState.required;
  for (const field of [
    "questionId",
    "questionType",
    "processingStatus",
    "currentAnswer",
    "reviewedAnswer",
    "officialWordMatch",
    "secondarySiteMatch",
    "adoptedBasis",
    "conflict",
    "explanationGenerationStatus",
    "generatedExplanation",
    "reviewedAt",
  ]) {
    assert.ok(required.includes(field), `schema missing ${field}`);
  }
  assert.equal(schema.$defs.manifest.properties.policy.properties.explanationPolicy.const, "independent_generation_only");
  assert.ok(schema.$defs.manifest.properties.appliedBatches.items.required.includes("reviewStage"));
  assert.ok(schema.$defs.manifest.properties.appliedBatches.items.required.includes("reviewers"));
  assert.equal(batchSchema.properties.reviews.maxItems, 100);
  assert.ok(batchSchema.properties.reviews.items.required.includes("questionFingerprint"));
  assert.ok(batchSchema.properties.reviews.items.required.includes("generatedExplanation"));
});

test("review state CLI validates, updates one shard atomically, and preserves work on sync", async () => {
  const temporaryState = await mkdtemp(join(tmpdir(), "theory-review-state-"));
  try {
    const temporaryContent = join(temporaryState, "content.json");
    const unpublishedContent = await readJson(new URL("../data/content.json", import.meta.url));
    delete unpublishedContent.theoryReview;
    await writeFile(temporaryContent, `${JSON.stringify(unpublishedContent, null, 2)}\n`, "utf8");
    const synced = runReviewState([
      "sync",
      "--content",
      temporaryContent,
      "--state-dir",
      temporaryState,
    ]);
    assert.equal(synced.summary.total, 900);

    const updated = runReviewState([
      "update",
      "--content",
      temporaryContent,
      "--state-dir",
      temporaryState,
      "single-001",
      "--processing-status",
      "reviewed",
      "--reviewed-answer",
      "[\"A\"]",
      "--adopted-source",
      "independent_review",
      "--explanation-status",
      "generated",
      "--generated-explanation",
      "This explanation was generated independently for the persistence test.",
      "--reviewed-at",
      "now",
      "--reviewed-by",
      "test-agent",
      "--note",
      "CLI persistence test",
    ]);
    assert.equal(updated.processingStatus, "reviewed");
    assert.deepEqual(updated.reviewedAnswer, ["A"]);
    assert.equal(updated.explanationGenerationStatus, "generated");
    assert.match(updated.reviewedAt, /^\d{4}-\d{2}-\d{2}T/);

    runReviewState([
      "sync",
      "--content",
      temporaryContent,
      "--state-dir",
      temporaryState,
    ]);
    const singleShard = JSON.parse(await readFile(join(temporaryState, "single-001-100.json"), "utf8"));
    const entry = singleShard.questions.find((question) => question.questionId === "single-001");
    assert.deepEqual(entry.reviewedAnswer, ["A"]);
    assert.equal(entry.reviewedBy, "test-agent");

    const secondEntry = singleShard.questions.find((question) => question.questionId === "single-002");
    const batchPath = join(temporaryState, "review-batch.json");
    await writeFile(
      batchPath,
      `${JSON.stringify(
        {
          schemaVersion: "1.0.0",
          batchId: "theory-900-review-2026-07-26-v1",
          shardId: "single-001-100",
          reviewedBy: "batch-test-agent",
          reviews: [
            {
              questionId: secondEntry.questionId,
              questionFingerprint: secondEntry.questionFingerprint,
              reviewedAnswer: secondEntry.currentAnswer,
              generatedExplanation: "An independently generated explanation for the batch import test.",
              notes: ["batch persistence test"],
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const batchResult = runReviewState([
      "apply-batch",
      "--content",
      temporaryContent,
      "--state-dir",
      temporaryState,
      "--input",
      batchPath,
    ]);
    assert.equal(batchResult.applied, 1);
    assert.equal(batchResult.shardId, "single-001-100");
    assert.equal(batchResult.summary.reviewed, 2);
    const importedShard = JSON.parse(await readFile(join(temporaryState, "single-001-100.json"), "utf8"));
    const importedEntry = importedShard.questions.find((question) => question.questionId === "single-002");
    assert.equal(importedEntry.reviewedBy, "batch-test-agent");
    assert.equal(importedEntry.adoptedBasis.source, "secondary_site");
    const generationManifest = JSON.parse(await readFile(join(temporaryState, "manifest.json"), "utf8"));
    const generationRecord = generationManifest.appliedBatches.find(
      (item) => item.shardId === "single-001-100",
    );
    assert.equal(generationRecord.reviewStage, "generation");
    assert.deepEqual(generationRecord.reviewers, ["batch-test-agent"]);

    const qaBatchPath = join(temporaryState, "review-batch-qa.json");
    await writeFile(
      qaBatchPath,
      `${JSON.stringify(
        {
          schemaVersion: "1.0.0",
          batchId: "theory-900-cross-review-test",
          shardId: "single-001-100",
          reviewStage: "qa",
          reviewedBy: "qa-test-agent",
          reviews: [
            {
              questionId: secondEntry.questionId,
              questionFingerprint: secondEntry.questionFingerprint,
              reviewedAnswer: secondEntry.currentAnswer,
              generatedExplanation: "An independently cross-reviewed explanation for the QA import test.",
              notes: ["QA persistence test"],
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const qaResult = runReviewState([
      "apply-batch",
      "--content",
      temporaryContent,
      "--state-dir",
      temporaryState,
      "--input",
      qaBatchPath,
    ]);
    assert.equal(qaResult.applied, 1);
    const qaManifest = JSON.parse(await readFile(join(temporaryState, "manifest.json"), "utf8"));
    const qaRecord = qaManifest.appliedBatches.find(
      (item) => item.batchId === "theory-900-cross-review-test",
    );
    assert.equal(qaRecord.reviewStage, "qa");
    assert.deepEqual(qaRecord.reviewers, ["qa-test-agent"]);

    const sameReviewerQaPath = join(temporaryState, "review-batch-qa-same-reviewer.json");
    await writeFile(
      sameReviewerQaPath,
      `${JSON.stringify(
        {
          schemaVersion: "1.0.0",
          batchId: "theory-900-cross-review-same-reviewer-test",
          shardId: "single-001-100",
          reviewStage: "qa",
          reviewedBy: "batch-test-agent",
          reviews: [
            {
              questionId: secondEntry.questionId,
              questionFingerprint: secondEntry.questionFingerprint,
              reviewedAnswer: secondEntry.currentAnswer,
              generatedExplanation: "This QA payload must be rejected because the reviewer is not independent.",
              notes: [],
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const sameReviewerQaResult = spawnReviewState([
      "apply-batch",
      "--content",
      temporaryContent,
      "--state-dir",
      temporaryState,
      "--input",
      sameReviewerQaPath,
    ]);
    assert.notEqual(sameReviewerQaResult.status, 0, "QA reviewer must differ from generation reviewer");

    const duplicateResult = spawnReviewState([
      "apply-batch",
      "--content",
      temporaryContent,
      "--state-dir",
      temporaryState,
      "--input",
      batchPath,
    ]);
    assert.notEqual(duplicateResult.status, 0, "same batchId + shardId must not be applied twice");

    const nextSingleShard = JSON.parse(await readFile(join(temporaryState, "single-101-200.json"), "utf8"));
    const nextEntry = nextSingleShard.questions.find((question) => question.questionId === "single-101");
    const nextBatchPath = join(temporaryState, "review-batch-next-shard.json");
    await writeFile(
      nextBatchPath,
      `${JSON.stringify(
        {
          schemaVersion: "1.0.0",
          batchId: "theory-900-review-2026-07-26-v1",
          reviewedBy: "batch-test-agent",
          reviews: [
            {
              questionId: nextEntry.questionId,
              questionFingerprint: nextEntry.questionFingerprint,
              reviewedAnswer: nextEntry.currentAnswer,
              generatedExplanation: "A second independently generated explanation in a different state shard.",
              notes: ["same batch id, different shard"],
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const nextBatchResult = runReviewState([
      "apply-batch",
      "--content",
      temporaryContent,
      "--state-dir",
      temporaryState,
      "--input",
      nextBatchPath,
    ]);
    assert.equal(nextBatchResult.shardId, "single-101-200");
    assert.equal(nextBatchResult.summary.reviewed, 3);

    const validated = runReviewState([
      "validate",
      "--content",
      temporaryContent,
      "--state-dir",
      temporaryState,
    ]);
    assert.equal(validated.valid, true);
    assert.equal(validated.summary.reviewed, 3);
    assert.equal(validated.summary.remaining, 897);
    const temporaryManifest = JSON.parse(await readFile(join(temporaryState, "manifest.json"), "utf8"));
    const appliedShards = temporaryManifest.appliedBatches
      .filter((item) => item.batchId === "theory-900-review-2026-07-26-v1")
      .map((item) => item.shardId)
      .sort();
    assert.deepEqual(appliedShards, ["single-001-100", "single-101-200"]);
  } finally {
    await rm(temporaryState, { recursive: true, force: true });
  }
});
