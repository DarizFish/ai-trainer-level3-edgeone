import navIndex from "@/data/practical-nav.json";

// 题目切换按钮的最小数据集。刻意不从 lib/content 取：那里顶层 import 了整份
// data/content.json（0.89 MB），而 PracticalTaskHeader 渲染在客户端组件内部，
// 引用它会把整份题库打进客户端包。这份索引由 scripts/generate-public-content.mjs
// 生成，contracts 断言它与 content.practical 的顺序和字段一致。
export type PracticalNavEntry = {
  code: string;
  hasNotebook: boolean;
  title: string;
};

export const practicalNav = navIndex as PracticalNavEntry[];

export function getPracticalNeighbors(code: string): {
  prev: PracticalNavEntry | null;
  next: PracticalNavEntry | null;
} {
  const index = practicalNav.findIndex((task) => task.code === code);
  if (index < 0) return { prev: null, next: null };
  return {
    prev: index > 0 ? practicalNav[index - 1] : null,
    next: index < practicalNav.length - 1 ? practicalNav[index + 1] : null,
  };
}

export function practicalTaskHref(task: PracticalNavEntry): string {
  return task.hasNotebook ? `/practical/${task.code}/lab` : `/practical/${task.code}`;
}
