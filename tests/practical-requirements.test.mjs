import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parsePracticalRequirements } from "../lib/practical-requirements.mjs";

const content = JSON.parse(await readFile(new URL("../data/content.json", import.meta.url), "utf8"));

function descriptionFor(code) {
  const task = content.practical.find(item => item.code === code);
  assert.ok(task, `missing practical task ${code}`);
  return task.description;
}

test("practical requirement parser supports all official top-level marker styles", () => {
  assert.equal(parsePracticalRequirements(descriptionFor("1.1.1")).requirements.length, 3);
  assert.equal(parsePracticalRequirements(descriptionFor("2.1.1")).requirements.length, 10);
  assert.equal(parsePracticalRequirements(descriptionFor("2.1.4")).requirements.length, 10);
});

test("decimal questionnaire items stay inside their numbered parent task", () => {
  const parsed = parsePracticalRequirements(descriptionFor("2.1.2"));

  assert.equal(parsed.requirements.length, 9);
  assert.match(parsed.requirements[4].text, /1\.您的性别/);
  assert.match(parsed.requirements[4].text, /8\.您是否认为低碳生活会提高您的生活质量/);
});

test("repeated numbering groups remain separate requirements", () => {
  const parsed = parsePracticalRequirements(descriptionFor("3.2.5"));

  assert.equal(parsed.requirements.length, 7);
  assert.equal(parsed.requirements[0].marker, "（1）");
  assert.match(parsed.requirements[5].text, /补全该模型的使用交互流程/);
  assert.match(parsed.introduction, /AI 模型说明/);
});
