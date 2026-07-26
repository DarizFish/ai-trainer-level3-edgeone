# 理论题审校批次

每个审校代理在本目录新增一个 JSON 文件；不要直接修改状态分片。建议一个批次对应一个 100 题分片，格式由 `../theory-review-batch.schema.json` 约束。

最小示例：

```json
{
  "$schema": "../theory-review-batch.schema.json",
  "schemaVersion": "1.0.0",
  "batchId": "theory-900-review-2026-07-26-v1",
  "shardId": "judge-001-100",
  "reviewedBy": "agent-or-reviewer-name",
  "reviews": [
    {
      "questionId": "judge-001",
      "questionFingerprint": "从 theory-review-state/judge-001-100.json 复制",
      "reviewedAnswer": ["√"],
      "generatedExplanation": "独立生成的解析正文，不复制次级站解析。",
      "notes": ["答案采用依据及必要的处理说明"],
      "adoptedSource": "independent_review",
      "resolveConflict": false
    }
  ]
}
```

导入前后均会校验题目指纹、答案范围、解析非空、次级站解析逐字复制、开放冲突和 900 题状态完整性：

```powershell
python scripts/theory_review_state.py apply-batch --input data/references/theory-review-batches/judge-001-100-review-v1.json
python scripts/theory_review_state.py validate
python scripts/theory_review_state.py summary
```

`reviewedBy` 可以放在批次顶层作为默认值，也可由逐题字段覆盖。`shardId` 可省略并由题号推导，但一个批次只能包含同一 100 题分片。

`adoptedSource` 可省略。导入器会按证据优先级自动判断：复核答案与官方 Word 匹配时采用 `official_word`；否则与严格匹配的次级站答案一致时采用 `secondary_site`；其余采用 `independent_review`。显式填写会覆盖自动判断，但官方或次级站来源必须与对应匹配记录及答案一致。

`apply-batch` 使用全局锁，先完整校验批次，再暂存并替换受影响分片与 `manifest.json`。幂等键为 `batchId + shardId`：同一轮不同分片可共用 `batchId`，同一分片重复导入会被拒绝。
