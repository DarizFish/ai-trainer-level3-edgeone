export const examBlueprint = {
  passingScore: 60,
  theory: {
    durationMinutes: 90,
    maxScore: 100,
    totalQuestions: 190,
    types: {
      judge: { label: "判断题", count: 40, points: 0.5 },
      single: { label: "单选题", count: 140, points: 0.5 },
      multi: { label: "多选题", count: 10, points: 1 },
    },
  },
  practical: {
    durationMinutes: 120,
    maxScore: 100,
    totalTasks: 6,
    modules: [
      { key: "business", label: "业务分析", groups: ["1.1", "1.2"], pick: 1, durationMinutes: 30, maxScore: 25 },
      { key: "data", label: "数据处理", groups: ["2.1"], pick: 1, durationMinutes: 20, maxScore: 15 },
      { key: "algorithm", label: "算法测试", groups: ["2.2"], pick: 1, durationMinutes: 20, maxScore: 20 },
      { key: "optimization", label: "系统优化", groups: ["3.1"], pick: 1, durationMinutes: 20, maxScore: 15 },
      { key: "interaction", label: "人机交互", groups: ["3.2"], pick: 1, durationMinutes: 20, maxScore: 20 },
      { key: "training", label: "培训 / 指导", groups: ["4.1", "4.2"], pick: 1, durationMinutes: 10, maxScore: 5 },
    ],
  },
} as const;

export type ExamBlueprint = typeof examBlueprint;
export type PracticalModule = (typeof examBlueprint.practical.modules)[number];

export function practicalModuleForGroup(group: string): PracticalModule | undefined {
  return examBlueprint.practical.modules.find((module) => (module.groups as readonly string[]).includes(group));
}
