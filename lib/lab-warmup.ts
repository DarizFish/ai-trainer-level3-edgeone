import type { PracticalTask } from "./content";

/**
 * 首次进入实操 lab 要下载几十 MB 的 Python 运行时与本题依赖，慢网下是分钟级的，
 * 期间界面看不出在做什么。这里负责判断该不该给出「首次加载环境」的提示。
 *
 * 冷热只能靠自己记账：immutable 的 wheel 和 must-revalidate 的 pyodide 核心都躺在
 * HTTP 磁盘缓存里，浏览器没有任何 API 能查询它，Worker 里发的请求主线程的
 * PerformanceObserver 也看不到。
 */

const PACKAGE_PATTERNS: Array<[RegExp, string]> = [
  [/(?:^|\n)\s*(?:import|from)\s+pandas\b/, "pandas"],
  [/(?:^|\n)\s*(?:import|from)\s+numpy\b/, "numpy"],
  [/(?:^|\n)\s*(?:import|from)\s+matplotlib\b/, "matplotlib"],
  [/(?:^|\n)\s*(?:import|from)\s+sklearn\b/, "scikit-learn"],
  [/(?:^|\n)\s*(?:import|from)\s+scipy\b/, "scipy"],
  [/(?:^|\n)\s*(?:import|from)\s+PIL\b/, "pillow"],
  [/(?:^|\n)\s*(?:import|from)\s+seaborn\b/, "seaborn"],
  [/(?:^|\n)\s*(?:import|from)\s+imblearn\b/, "imbalanced-learn"],
  [/(?:^|\n)\s*(?:import|from)\s+xgboost\b/, "xgboost"],
  [/(?:^|\n)\s*(?:import|from)\s+cv2\b/, "opencv-python"],
];

function taskSource(task: PracticalTask): string {
  const cells = [...(task.notebook?.cells ?? []), ...(task.notebook?.solutionCells ?? [])];
  return cells.map(cell => cell.source).join("\n");
}

export function labHasModel(task: PracticalTask): boolean {
  return /(?:^|\n)\s*(?:import|from)\s+onnxruntime\b/.test(taskSource(task));
}

/**
 * 热身标记按「包集合」而不是题号归类。1.1.2 做完再进 1.1.3 用的是同一套 wheel，
 * 是真热；但进 2.1.3 还要再下 40MB，必须重新提示。labRevision 进键名，运行时一
 * 升级所有标记自然失效。
 */
export function warmupStorageKey(task: PracticalTask, labRevision: string): string {
  const source = taskSource(task);
  const packages = PACKAGE_PATTERNS.filter(([pattern]) => pattern.test(source)).map(([, name]) => name);
  return `ai-trainer-lab-warm:${labRevision}:${packages.join("+") || "none"}`;
}

const listeners = new Set<() => void>();

/** 冷热只会被本模块的 markLabWarm 改动，订阅它即可让 useSyncExternalStore 生效。 */
export function subscribeWarmth(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function isLabCold(task: PracticalTask, labRevision: string): boolean {
  try {
    return localStorage.getItem(warmupStorageKey(task, labRevision)) !== "1";
  } catch {
    // 隐私模式下 localStorage 会抛。宁可多提示一次，也不要在真冷启动时沉默。
    return true;
  }
}

/**
 * 只有真正走完全部准备阶段才写标记。中途关页面 = 没写 = 下次仍然提示，这正是想要
 * 的：半途中断的下载并不能让下一次快多少。
 */
export function markLabWarm(task: PracticalTask, labRevision: string): void {
  try {
    localStorage.setItem(warmupStorageKey(task, labRevision), "1");
  } catch {
    // 存不下就下次再提示一遍，没有别的后果。
  }
  for (const listener of listeners) listener();
}
