import type { WordAnswerBlock } from "@/lib/practical-word-answer";

/**
 * 复盘面板里的官方参考答案：小节标题 + 条目。四处答题卷（1.2/3.1 答题纸、
 * Notebook 题的 Word 交付物、模拟考复盘、题目详情页）共用同一套呈现，避免同一份
 * 答案在不同页面长得不一样。
 */
export function WordAnswerBlocks({ blocks }: { blocks: WordAnswerBlock[] }) {
  if (!blocks.length) return null;
  return <div className="word-answer-blocks">{blocks.map((block, index) => <section className="word-answer-block" key={`${index}-${block.heading}`}>
    <b>{block.heading}</b>
    <ul>{block.lines.map((line, lineIndex) => <li key={lineIndex}>{line}</li>)}</ul>
  </section>)}</div>;
}
