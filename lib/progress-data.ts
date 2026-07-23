import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { practicalByCode, theoryById } from "@/lib/content";
import { examBlueprint, practicalModuleForGroup } from "@/lib/exam-blueprint";

export type ProgressData = Awaited<ReturnType<typeof getProgressData>>;

type ProgressSummary = {
  answered: number;
  wrong: number;
  favorites: number;
  practicalAttempts: number;
  mockAttempts: number;
  bestTheoryScore: number;
  drafts: number;
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
  recentMockRows: {
    mode: string;
    score: number;
    maxScore: number;
    passed: boolean;
    createdAt: string;
  }[];
  recentPracticalRows: {
    taskCode: string;
    score: number;
    maxScore: number;
    createdAt: string;
  }[];
  practicalRows: {
    taskCode: string;
    bestRatio: number;
    attempts: number;
  }[];
};

export async function getProgressData(email: string) {
  const db = getDb();
  const rows = await db.execute(sql`
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
      ),
      theory_attempt_rows as materialized (
        select mode, score, max_score, passed, created_at
        from theory_attempts
        where email = ${email}
      ),
      practical_attempt_rows as materialized (
        select task_code, score, max_score, created_at
        from practical_attempts
        where email = ${email}
      ),
      draft_rows as materialized (
        select task_code
        from code_drafts
        where email = ${email}
      )
    select
      (select count(*)::int from theory_progress_rows) as "answered",
      (select count(*)::int from theory_progress_rows where correct = false) as "wrong",
      (select count(*)::int from favorite_rows where active = true) as "favorites",
      (select count(*)::int from practical_attempt_rows) as "practicalAttempts",
      (select count(*)::int from theory_attempt_rows) as "mockAttempts",
      coalesce((select max(score)::float8 from theory_attempt_rows), 0::float8) as "bestTheoryScore",
      (select count(*)::int from draft_rows) as "drafts",
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
      ), '[]'::jsonb) as "favoriteRows",
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'mode', item.mode,
          'score', item.score,
          'maxScore', item.max_score,
          'passed', item.passed,
          'createdAt', item.created_at
        ) order by item.created_at desc)
        from (
          select mode, score, max_score, passed, created_at
          from theory_attempt_rows
          order by created_at desc
          limit 8
        ) item
      ), '[]'::jsonb) as "recentMockRows",
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'taskCode', item.task_code,
          'score', item.score,
          'maxScore', item.max_score,
          'createdAt', item.created_at
        ) order by item.created_at desc)
        from (
          select task_code, score, max_score, created_at
          from practical_attempt_rows
          order by created_at desc
          limit 8
        ) item
      ), '[]'::jsonb) as "recentPracticalRows",
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'taskCode', item.task_code,
          'bestRatio', item.best_ratio,
          'attempts', item.attempts
        ))
        from (
          select
            task_code,
            max(score / nullif(max_score, 0))::float8 as best_ratio,
            count(*)::int as attempts
          from practical_attempt_rows
          group by task_code
        ) item
      ), '[]'::jsonb) as "practicalRows"
  `);
  const summary = rows[0] as unknown as ProgressSummary;
  const {
    wrongRows,
    favoriteRows,
    recentMockRows,
    recentPracticalRows,
    practicalRows,
  } = summary;

  const practicalAbility = examBlueprint.practical.modules.map((module) => {
    const rows = practicalRows.filter((row) => {
      const task = practicalByCode.get(row.taskCode);
      return task && practicalModuleForGroup(task.group)?.key === module.key;
    });
    const bestScore = rows.reduce(
      (bestValue, row) => Math.max(
        bestValue,
        row.bestRatio * module.maxScore,
      ),
      0,
    );
    return {
      key: module.key,
      label: module.label,
      maxScore: module.maxScore,
      bestScore: Math.round(bestScore * 10) / 10,
      attempts: rows.reduce((total, row) => total + row.attempts, 0),
    };
  });

  const wrongItems = wrongRows.flatMap((row) => {
    const question = theoryById.get(row.questionId);
    if (!question) return [];
    return [{
      id: question.id,
      index: question.index,
      typeLabel: question.typeLabel,
      category: question.category,
      stem: question.stem,
      selectedAnswer: JSON.parse(row.answerJson) as string[],
      correctAnswer: question.answer,
      attempts: row.attempts,
      updatedAt: row.updatedAt,
      href: `/theory?question=${encodeURIComponent(question.id)}`,
    }];
  });

  const favoriteItems = favoriteRows.flatMap<{
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
      const href = task?.hasNotebook
        ? `/practical/${encodeURIComponent(task.code)}/lab`
        : `/practical/${encodeURIComponent(task?.code ?? row.itemId)}`;
      return task ? [{
        itemType: "practical" as const,
        itemId: task.code,
        title: task.title,
        meta: `${task.code} · ${task.category}`,
        href,
        updatedAt: row.updatedAt,
      }] : [];
    }
    return [];
  });

  return {
    answered: summary.answered,
    wrong: summary.wrong,
    favorites: summary.favorites,
    practicalAttempts: summary.practicalAttempts,
    mockAttempts: summary.mockAttempts,
    bestTheoryScore: summary.bestTheoryScore,
    practicalAbility,
    estimatedPracticalScore: practicalAbility.reduce((sum, module) => sum + module.bestScore, 0),
    drafts: summary.drafts,
    wrongItems,
    favoriteItems,
    recentMocks: recentMockRows,
    recentPractical: recentPracticalRows.map((row) => {
      const task = practicalByCode.get(row.taskCode);
      return {
        ...row,
        title: task?.title ?? row.taskCode,
        href: task?.hasNotebook
          ? `/practical/${encodeURIComponent(row.taskCode)}/lab`
          : `/practical/${encodeURIComponent(row.taskCode)}`,
      };
    }),
  };
}
