import { sql } from "drizzle-orm";
import { withDbDeadline } from "@/db";
import { practicalByCode, theoryById } from "@/lib/content";

export type ProgressData = Awaited<ReturnType<typeof getProgressData>>;

type ProgressSummary = {
  answeredRows: {
    questionId: string;
  }[];
  wrongRows: {
    questionId: string;
    answerJson: string;
    attempts: number;
    updatedAt: string;
  }[];
  favoriteRows: {
    itemType: string;
    itemId: string;
    updatedAt: string;
  }[];
};

export async function getProgressData(email: string) {
  const rows = await withDbDeadline("progress.summary", (db) => db.execute(sql`
    with
      theory_progress_rows as materialized (
        select question_id, answer_json, correct, attempts, updated_at
        from theory_progress
        where email = ${email}
      ),
      favorite_rows as materialized (
        select item_type, item_id, active, updated_at
        from favorites
        where email = ${email}
      )
    select
      coalesce((
        select jsonb_agg(jsonb_build_object('questionId', question_id))
        from theory_progress_rows
      ), '[]'::jsonb) as "answeredRows",
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'questionId', item.question_id,
          'answerJson', item.answer_json,
          'attempts', item.attempts,
          'updatedAt', item.updated_at
        ) order by item.updated_at desc)
        from (
          select question_id, answer_json, attempts, updated_at
          from theory_progress_rows
          where correct = false
          order by updated_at desc
          limit 50
        ) item
      ), '[]'::jsonb) as "wrongRows",
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'itemType', item.item_type,
          'itemId', item.item_id,
          'updatedAt', item.updated_at
        ) order by item.updated_at desc)
        from (
          select item_type, item_id, updated_at
          from favorite_rows
          where active = true
          order by updated_at desc
          limit 50
        ) item
      ), '[]'::jsonb) as "favoriteRows"
  `));
  const summary = rows[0] as unknown as ProgressSummary;
  const allTheoryQuestions = [...theoryById.values()];
  const answeredQuestionIds = new Set(summary.answeredRows.map((row) => row.questionId));
  const theoryTypeProgress = ([
    { type: "judge" as const, label: "判断题" },
    { type: "single" as const, label: "单选题" },
    { type: "multi" as const, label: "多选题" },
  ]).map((item) => {
    const typedQuestions = allTheoryQuestions.filter((question) => question.type === item.type);
    return {
      ...item,
      answered: typedQuestions.filter((question) => answeredQuestionIds.has(question.id)).length,
      total: typedQuestions.length,
    };
  });

  const wrongItems = summary.wrongRows.flatMap((row) => {
    const question = theoryById.get(row.questionId);
    if (!question) return [];
    return [{
      id: question.id,
      index: question.index,
      typeLabel: question.typeLabel,
      category: question.category,
      stem: question.stem,
      selectedAnswer: JSON.parse(row.answerJson) as string[],
      attempts: row.attempts,
      updatedAt: row.updatedAt,
      href: `/theory?question=${encodeURIComponent(question.id)}`,
    }];
  });

  const favoriteItems = summary.favoriteRows.flatMap<{
    itemType: "theory" | "practical";
    itemId: string;
    title: string;
    meta: string;
    href: string;
    updatedAt: string;
  }>((row) => {
    if (row.itemType === "theory") {
      const question = theoryById.get(row.itemId);
      return question ? [{
        itemType: "theory" as const,
        itemId: question.id,
        title: question.stem,
        meta: `${question.typeLabel} · ${question.category}`,
        href: `/theory?question=${encodeURIComponent(question.id)}`,
        updatedAt: row.updatedAt,
      }] : [];
    }
    if (row.itemType === "practical") {
      const task = practicalByCode.get(row.itemId);
      return task ? [{
        itemType: "practical" as const,
        itemId: task.code,
        title: task.title,
        meta: `${task.code} · ${task.category}`,
        href: task.hasNotebook
          ? `/practical/${encodeURIComponent(task.code)}/lab`
          : `/practical/${encodeURIComponent(task.code)}`,
        updatedAt: row.updatedAt,
      }] : [];
    }
    return [];
  });

  return { theoryTypeProgress, wrongItems, favoriteItems };
}
