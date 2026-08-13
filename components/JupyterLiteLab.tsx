"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createBridge } from "jupyter-iframe-commands-host";
import type { PracticalTask } from "@/lib/content";
import { getPracticalWordDeliverable } from "@/lib/practical-word-deliverable";
import { isLabCold, labHasModel, markLabWarm, subscribeWarmth } from "@/lib/lab-warmup";
import { PracticalWordDeliverable } from "./PracticalWordDeliverable";
import LabWarmupNotice, { type WarmupStage } from "./LabWarmupNotice";

type NotebookCell = {
  cell_type: string;
  metadata: Record<string, unknown>;
  source: string | string[];
  [key: string]: unknown;
};

type NotebookJson = {
  cells: NotebookCell[];
  metadata: Record<string, unknown>;
  nbformat: number;
  nbformat_minor: number;
};

type LegacyCell = { id: string; source: string };
type Bridge = ReturnType<typeof createBridge>;
type Conflict = { cloud: NotebookJson; local: NotebookJson; revision: number };

function isNotebook(value: unknown): value is NotebookJson {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NotebookJson>;
  return Array.isArray(candidate.cells)
    && typeof candidate.nbformat === "number"
    && typeof candidate.nbformat_minor === "number"
    && Boolean(candidate.metadata);
}

function isLegacyCells(value: unknown): value is LegacyCell[] {
  return Array.isArray(value) && value.every(item => item && typeof item.id === "string" && typeof item.source === "string");
}

function cloneNotebook(notebook: NotebookJson): NotebookJson {
  return JSON.parse(JSON.stringify(notebook)) as NotebookJson;
}

function cloneCell(cell: NotebookCell): NotebookCell {
  return JSON.parse(JSON.stringify(cell)) as NotebookCell;
}

function notebookSourceLength(notebook: NotebookJson): number {
  return notebook.cells.reduce((total, cell) => total + (Array.isArray(cell.source) ? cell.source.join("").length : cell.source.length), 0);
}

// 用来挡住截断或损坏的模板与草稿。单元数下限只能是 1：2.1.3、2.1.4、2.1.5 的官方
// 题目本来就只有一个习题单元，环境准备单元移出题目文件后它们的总单元数变成 1，
// 原先的 >= 2 会把这三题的模板和草稿全部判为无效。真正防截断的是源码长度那一条。
function isSubstantiveNotebook(notebook: NotebookJson): boolean {
  return notebook.cells.length >= 1 && notebookSourceLength(notebook) >= 100;
}

// 实验室里靠 display:none 隐藏的基础设施单元不能跟着导出：ai-trainer-onnx 是把
// onnxruntime 接到 onnxruntime-web 的浏览器垫片，学员把 .ipynb 拿到本地真实 Python
// 里跑时，需要的是真的 onnxruntime，垫片反而会顶掉它。ai-trainer-setup 只存在于旧
// 草稿里，一并滤掉。导出的应当只有考试本身的代码。
const INFRASTRUCTURE_CELL_TAGS = new Set(["ai-trainer-setup", "ai-trainer-onnx"]);

function withoutInfrastructureCells(notebook: NotebookJson): NotebookJson {
  return {
    ...notebook,
    cells: notebook.cells.filter(cell => {
      const tags = cell.metadata?.tags;
      return !(Array.isArray(tags) && tags.some(tag => INFRASTRUCTURE_CELL_TAGS.has(String(tag))));
    }),
  };
}

function normalizeDraft(value: unknown, baseline: NotebookJson): NotebookJson | null {
  if (isNotebook(value)) {
    const incomingById = new Map<string, NotebookCell>();
    for (const cell of value.cells) {
      const id = cell.metadata?.ai_trainer_cell_id;
      if (typeof id === "string") incomingById.set(id, cell);
    }
    const notebook = cloneNotebook(baseline);
    notebook.cells = notebook.cells.map(cell => {
      const id = cell.metadata?.ai_trainer_cell_id;
      if (typeof id !== "string") return cell;
      const incoming = incomingById.get(id);
      return incoming ? { ...cloneCell(incoming), metadata: cloneCell(cell).metadata } : cell;
    });
    return notebook;
  }
  if (!isLegacyCells(value)) return null;
  const legacy = new Map(value.map(cell => [cell.id, cell.source]));
  const notebook = cloneNotebook(baseline);
  for (const cell of notebook.cells) {
    const id = cell.metadata?.ai_trainer_cell_id;
    if (typeof id === "string" && legacy.has(id)) cell.source = legacy.get(id)!;
  }
  return notebook;
}

function kernelLabel(status: string): string {
  const labels: Record<string, string> = {
    idle: "内核空闲",
    busy: "正在运行",
    starting: "正在启动 Python",
    restarting: "正在重启",
    autorestarting: "正在自动恢复",
    dead: "内核已停止",
    unknown: "等待内核",
  };
  return labels[status] ?? status;
}

type FillReferenceItem = {
  lineIndex: number;
  templateLine: string;
  referenceLine: string;
  answers: string[];
};

type FillReviewSummary = { total: number; exact: number; different: number; empty: number };

type FillReferenceCell = {
  cellId: string;
  items: FillReferenceItem[];
};

const BLANK_PATTERN = /_{3,}/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractBlankAnswers(templateLine: string, completedLine: string): string[] | null {
  const matches = [...templateLine.matchAll(BLANK_PATTERN)];
  if (matches.length === 0) return [];
  let cursor = 0;
  let pattern = "^";
  for (const match of matches) {
    pattern += escapeRegExp(templateLine.slice(cursor, match.index));
    pattern += "(.*?)";
    cursor = (match.index ?? 0) + match[0].length;
  }
  pattern += escapeRegExp(templateLine.slice(cursor)) + "$";
  const result = completedLine.match(new RegExp(pattern));
  return result ? result.slice(1).map(value => value.trim()) : null;
}

function lineHasTemplateAnchors(templateLine: string, candidate: string): boolean {
  const anchors = templateLine.split(BLANK_PATTERN).map(value => value.trim()).filter(value => value.length >= 2);
  if (anchors.length === 0) return false;
  let cursor = 0;
  for (const anchor of anchors) {
    const next = candidate.indexOf(anchor, cursor);
    if (next < 0) return false;
    cursor = next + anchor.length;
  }
  return true;
}

function locateCompletedLine(templateLine: string, lines: string[], expectedIndex: number): string | null {
  const expected = lines[expectedIndex];
  if (typeof expected === "string" && (extractBlankAnswers(templateLine, expected) || lineHasTemplateAnchors(templateLine, expected))) return expected;
  const candidates = lines.filter(line => lineHasTemplateAnchors(templateLine, line));
  return candidates.length === 1 ? candidates[0] : null;
}

function buildFillReferences(templateCells: Array<{ id: string; source: string }>, solutionCells: Array<{ id: string; source: string }>): FillReferenceCell[] {
  const pairedSolutions = solutionCells.length === templateCells.length;
  const combinedReferenceLines = solutionCells.length === 1 ? solutionCells[0].source.replaceAll("\r", "").split("\n") : [];
  let combinedLineOffset = 0;

  return templateCells.map((cell, cellIndex) => {
    const templateLines = cell.source.replaceAll("\r", "").split("\n");
    const referenceLines = pairedSolutions
      ? solutionCells[cellIndex].source.replaceAll("\r", "").split("\n")
      : combinedReferenceLines;
    const expectedOffset = pairedSolutions ? 0 : combinedLineOffset;
    const items = templateLines.flatMap((templateLine, lineIndex): FillReferenceItem[] => {
      if (![...templateLine.matchAll(BLANK_PATTERN)].length) return [];
      const referenceLine = locateCompletedLine(templateLine, referenceLines, expectedOffset + lineIndex)
        ?? referenceLines[expectedOffset + lineIndex]
        ?? "";
      return [{
        lineIndex,
        templateLine,
        referenceLine,
        answers: extractBlankAnswers(templateLine, referenceLine) ?? [referenceLine.trim()],
      }];
    });
    combinedLineOffset += templateLines.length + 2;
    return { cellId: cell.id, items };
  }).filter(cell => cell.items.length > 0);
}

export default function JupyterLiteLab({ task, signedIn, userEmail = null, examMode = false, activeSurface = "notebook" }: { task: PracticalTask; signedIn: boolean; userEmail?: string | null; examMode?: boolean; activeSurface?: "notebook" | "document" }) {
  const labRevision = "20260726-pyodide0277-runtime11";
  const iframeId = useMemo(() => `jupyterlite-${task.code.replaceAll(".", "-")}`, [task.code]);
  // JupyterLite 用 PathExt.extname() 判断一个路径是不是目录，所以题号不能直接当
  // 目录名：1.1.1 会被解析成扩展名为 ".1" 的文件，newUntitled 于是写到根目录去，
  // 在题号文件夹里“新建文本文件”还会造出一个同名空文件把整个目录遮掉。目录名去
  // 点即可走对分支。与 scripts/generate-jupyterlite-notebooks.py 的 workspace_slug 一致。
  const workspaceDir = task.code.replaceAll(".", "-");
  const notebookPath = `${workspaceDir}/${task.code}.ipynb`;
  const workspaceSlug = `ai-trainer-${task.code.replaceAll(".", "-")}-${labRevision}`;
  const notebookUrl = `/lite/lab/index.html?path=${encodeURIComponent(notebookPath)}&workspace=${workspaceSlug}-embed&ui=${labRevision}${examMode ? "&exam=1" : ""}`;
  const fullNotebookUrl = `/lite/lab/index.html?path=${encodeURIComponent(notebookPath)}&workspace=${workspaceSlug}-full&ui=${labRevision}`;
  const templateUrl = `/lite/files/${notebookPath}`;
  const localKey = `ai-trainer-notebook:${labRevision}:${task.code}`;
  const bridgeRef = useRef<Bridge | null>(null);
  const templateRef = useRef<NotebookJson | null>(null);
  const kernelRef = useRef("unknown");
  const revisionRef = useRef(0);
  const initializedRef = useRef(false);
  const suppressChangesRef = useRef(false);
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveActionRef = useRef<() => void>(() => undefined);
  const [ready, setReady] = useState(false);
  const [kernel, setKernel] = useState("unknown");
  const [revision, setRevision] = useState(0);
  const [saveState, setSaveState] = useState("正在连接 JupyterLite…");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [iframeGeneration, setIframeGeneration] = useState(0);
  const [startupSlow, setStartupSlow] = useState(false);
  const [warmupStage, setWarmupStage] = useState<WarmupStage>("shell");
  const [fillReview, setFillReview] = useState<{ visible: boolean; summary: FillReviewSummary } | null>(null);
  const wordDeliverable = useMemo(() => getPracticalWordDeliverable(task), [task]);
  const solutionCells = task.notebook?.solutionCells;
  const templateCells = task.notebook?.cells;
  const fillReferences = useMemo(() => templateCells && solutionCells ? buildFillReferences(templateCells, solutionCells) : [], [solutionCells, templateCells]);

  // 冷热要读 localStorage，服务端拿不到。用 useSyncExternalStore 而不是「effect 里
  // setState」：服务端快照恒为 false，客户端首帧就取到真值，既不会 hydration 不一致，
  // 也不会多一轮级联渲染。markLabWarm 会通知订阅者，提示随即收起。
  const cold = useSyncExternalStore(
    subscribeWarmth,
    () => isLabCold(task, labRevision),
    () => false,
  );
  const hasModel = useMemo(() => labHasModel(task), [task]);

  const finishWarmup = useCallback(() => {
    // 只有真正走完准备阶段才记热身，中途关页面下次仍会提示。
    markLabWarm(task, labRevision);
    setWarmupStage("ready");
  }, [labRevision, task]);

  const configureFillReferences = useCallback(async (bridge: Bridge) => {
    if (examMode || fillReferences.length === 0) return;
    const args = { path: notebookPath, references: fillReferences } as unknown as Parameters<Bridge["execute"]>[1];
    await bridge.execute("ai-trainer:set-fill-review", args);
  }, [examMode, fillReferences, notebookPath]);

  const requireSignIn = useCallback(() => {
    const returnTo = examMode ? "/practical/mock" : `/practical/${task.code}/lab`;
    window.location.assign(`/account?mode=login&return_to=${encodeURIComponent(returnTo)}`);
  }, [examMode, task.code]);

  const readNotebook = useCallback(async (): Promise<NotebookJson> => {
    const value = await bridgeRef.current?.execute("ai-trainer:get-notebook", { path: notebookPath });
    if (!isNotebook(value)) throw new Error("无法从 JupyterLite 读取 Notebook");
    return value;
  }, [notebookPath]);

  const loadTemplate = useCallback(async (): Promise<NotebookJson> => {
    if (templateRef.current) return cloneNotebook(templateRef.current);
    const response = await fetch(`${templateUrl}?template=${encodeURIComponent(task.code)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("无法读取原始 Notebook 模板");
    const value = await response.json() as unknown;
    if (!isNotebook(value) || !isSubstantiveNotebook(value)) throw new Error("原始 Notebook 模板格式无效");
    templateRef.current = value;
    return cloneNotebook(value);
  }, [task.code, templateUrl]);

  const applyNotebook = useCallback(async (notebook: NotebookJson) => {
    suppressChangesRef.current = true;
    const args = { path: notebookPath, notebook } as unknown as Parameters<Bridge["execute"]>[1];
    const bridge = bridgeRef.current;
    await bridge?.execute("ai-trainer:set-notebook", args);
    if (bridge) await configureFillReferences(bridge);
    localStorage.setItem(localKey, JSON.stringify(notebook));
    window.setTimeout(() => { suppressChangesRef.current = false; }, 800);
  }, [configureFillReferences, localKey, notebookPath]);

  const saveDraft = useCallback(async (forced?: NotebookJson, baseRevision?: number) => {
    if (!signedIn) return requireSignIn();
    if (!bridgeRef.current || !initializedRef.current) return;
    setSaveState("正在同步完整 Notebook…");
    setError(null);
    try {
      const notebook = forced ?? await readNotebook();
      const response = await fetch(`/api/drafts/${task.code}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notebook, revision: baseRevision ?? revisionRef.current }),
      });
      if (response.status === 409) {
        const data = await response.json() as { cloud: unknown; local: unknown; revision: number };
        const baseline = await loadTemplate();
        const cloud = normalizeDraft(data.cloud, baseline);
        const local = normalizeDraft(data.local, baseline);
        if (!cloud || !local) throw new Error("云端冲突数据格式无效");
        revisionRef.current = data.revision;
        setRevision(data.revision);
        setConflict({ cloud, local, revision: data.revision });
        setSaveState("发现多设备冲突");
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? "云端保存失败");
      }
      const data = await response.json() as { revision: number };
      revisionRef.current = data.revision;
      setRevision(data.revision);
      localStorage.setItem(localKey, JSON.stringify(notebook));
      setSaveState("已同步到云端");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setSaveState("同步失败，可稍后重试");
    }
  }, [loadTemplate, localKey, readNotebook, requireSignIn, signedIn, task.code]);

  useEffect(() => {
    saveActionRef.current = () => { void saveDraft(); };
  }, [saveDraft]);

  const snapshotAndSchedule = useCallback(() => {
    if (!initializedRef.current || suppressChangesRef.current) return;
    setSaveState(signedIn ? "有未同步修改" : "已保存到本机；登录后可云端同步");
    if (snapshotRef.current) clearTimeout(snapshotRef.current);
    snapshotRef.current = setTimeout(() => {
      void readNotebook().then(notebook => localStorage.setItem(localKey, JSON.stringify(notebook))).catch(() => undefined);
    }, 1200);
    if (signedIn) {
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
      autosaveRef.current = setTimeout(() => { void saveDraft(); }, 12000);
    }
  }, [localKey, readNotebook, saveDraft, signedIn]);

  const loadDrafts = useCallback(async () => {
    const currentNotebook = await readNotebook();
    const baseline = await loadTemplate();
    const resetKey = `ai-trainer-practical-reset:${task.code}`;
    if (localStorage.getItem(resetKey) === "1") {
      localStorage.removeItem(resetKey);
      localStorage.removeItem(localKey);
      localStorage.removeItem(`ai-trainer-draft:${task.code}`);
      setConflict(null);
      revisionRef.current = 0;
      setRevision(0);
      await applyNotebook(baseline);
      setSaveState("章节进度已重置，已恢复原始 Notebook");
      initializedRef.current = true;
      return;
    }
    const normalizedCurrent = normalizeDraft(currentNotebook, baseline);
    let local: NotebookJson | null = null;
    const localSerialized = localStorage.getItem(localKey) ?? localStorage.getItem(`ai-trainer-draft:${task.code}`);
    if (localSerialized) {
      try {
        const candidate = normalizeDraft(JSON.parse(localSerialized), baseline);
        local = candidate && isSubstantiveNotebook(candidate) ? candidate : null;
      } catch { local = null; }
      if (!local) {
        localStorage.removeItem(localKey);
        localStorage.removeItem(`ai-trainer-draft:${task.code}`);
      }
    }

    let cloud: NotebookJson | null = null;
    let cloudRevision = 0;
    let invalidCloud = false;
    if (signedIn) {
      const response = await fetch(`/api/drafts/${task.code}`);
      if (response.ok) {
        const data = await response.json() as { draft: { cellsJson: string; revision: number } | null };
        if (data.draft) {
          cloudRevision = data.draft.revision;
          const candidate = normalizeDraft(JSON.parse(data.draft.cellsJson), baseline);
          cloud = candidate && isSubstantiveNotebook(candidate) ? candidate : null;
          invalidCloud = !cloud;
        }
      }
    }
    revisionRef.current = cloudRevision;
    setRevision(cloudRevision);

    if (local && cloud && JSON.stringify(local) !== JSON.stringify(cloud)) {
      setConflict({ local, cloud, revision: cloudRevision });
      setSaveState("请选择本机或云端版本");
    } else if (cloud) {
      await applyNotebook(cloud);
      setSaveState("已载入云端 Notebook");
    } else if (local) {
      await applyNotebook(local);
      setSaveState(signedIn ? "已恢复本机 Notebook，等待云端同步" : "已恢复本机 Notebook");
    } else if (normalizedCurrent && isSubstantiveNotebook(normalizedCurrent) && !invalidCloud) {
      if (JSON.stringify(normalizedCurrent) !== JSON.stringify(currentNotebook)) await applyNotebook(normalizedCurrent);
      localStorage.setItem(localKey, JSON.stringify(normalizedCurrent));
      setSaveState(signedIn ? "Notebook 已就绪" : "Notebook 已就绪；登录后可云端同步");
    } else {
      await applyNotebook(baseline);
      setSaveState(invalidCloud ? "检测到损坏的云端草稿，已恢复原始模板" : "检测到空白或损坏的本机文件，已恢复原始模板");
    }
    initializedRef.current = true;
    if (invalidCloud && signedIn) await saveDraft(baseline, cloudRevision);
  }, [applyNotebook, loadTemplate, localKey, readNotebook, saveDraft, signedIn, task.code]);

  useEffect(() => {
    initializedRef.current = false;
    kernelRef.current = "unknown";
    const bridge = createBridge({ iframeId });
    bridgeRef.current = bridge;
    let cancelled = false;
    let bridgeConnected = false;
    let startupTimer: number | null = null;
    const connectionTimer = window.setTimeout(() => {
      if (cancelled || bridgeConnected) return;
      setStartupSlow(true);
      setError("JupyterLite 主界面加载超时。可能是网络波动或旧运行时缓存；点击“重新加载环境”会发起新的资源请求，草稿不会被删除。");
    }, 30000);
    void bridge.ready.then(async () => {
      bridgeConnected = true;
      setWarmupStage("kernel");
      window.clearTimeout(connectionTimer);
      for (let attempt = 0; attempt < 60 && !cancelled; attempt += 1) {
        try {
          const state = await bridge.execute("ai-trainer:get-state", { path: notebookPath }) as { kernel?: string };
          if (cancelled) return;
          if (state.kernel) {
            kernelRef.current = state.kernel;
            setKernel(state.kernel);
          }
          setReady(true);
          // 内核启动是这条链路上最长的一段（实测 19–35 秒），而草稿加载要等桥接
          // 往返、模板 fetch 和云端草稿。先把内核踢起来再去加载草稿，两段就重叠了。
          // 扩展侧 ensure-kernel 用 kernelStarts 这个 WeakMap 对并发启动做了去重，
          // 后面 prepare-exercise 会复用同一个 Promise，不会重复启动内核。
          const kernelStart = bridge.execute("ai-trainer:ensure-kernel", { path: notebookPath });
          kernelStart.catch(() => undefined);
          await loadDrafts();
          await configureFillReferences(bridge);
          startupTimer = window.setTimeout(() => {
            if (cancelled || kernelRef.current === "idle" || kernelRef.current === "busy") return;
            setStartupSlow(true);
            setSaveState("Python 内核仍在准备；环境会保持当前状态，不会自动重载");
          }, 15000);
          try {
            setSaveState("正在准备运行环境、素材与模型…");
            await bridge.execute("ai-trainer:prepare-exercise", { path: notebookPath });
            if (startupTimer) {
              window.clearTimeout(startupTimer);
              startupTimer = null;
            }
            setStartupSlow(false);
            setError(null);
            finishWarmup();
            setSaveState(signedIn ? "代码区已就绪；修改会自动同步" : "代码区已就绪；登录后可云端同步");
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : String(cause);
            setStartupSlow(true);
            setError(`题目环境准备失败：${message}`);
          }
          return;
        } catch {
          await new Promise(resolve => window.setTimeout(resolve, 250));
        }
      }
      if (!cancelled) {
        setStartupSlow(true);
        setError("JupyterLite 环境未能连接，可点击“重新加载环境”自动恢复；你的本机草稿不会被删除。");
      }
    }).catch(cause => {
      if (cancelled) return;
      window.clearTimeout(connectionTimer);
      setStartupSlow(true);
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(`JupyterLite 主界面加载失败：${message || "请重新加载环境重试"}`);
    });

    const onMessage = (event: MessageEvent) => {
      const iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
      if (event.origin !== window.location.origin || event.source !== iframe?.contentWindow) return;
      const data = event.data as { type?: string; path?: string; status?: string; message?: string; stage?: string };
      if (data.path && data.path !== notebookPath) return;
      if (data.type === "AI_TRAINER_SAVE_REQUEST") saveActionRef.current();
      if (data.type === "AI_TRAINER_NOTEBOOK_CHANGED") snapshotAndSchedule();
      if (data.type === "AI_TRAINER_KERNEL_STATUS" && data.status) {
        kernelRef.current = data.status;
        setKernel(data.status);
        if (data.status === "idle" || data.status === "busy") {
          setStartupSlow(false);
          setError(current => current?.startsWith("Python 内核") ? null : current);
        }
      }
      if (data.type === "AI_TRAINER_EXERCISE_PREPARING") setSaveState("正在准备运行环境、素材与模型…");
      if (data.type === "AI_TRAINER_EXERCISE_STAGE" && (data.stage === "packages" || data.stage === "runtime")) {
        setWarmupStage(data.stage);
      }
      if (data.type === "AI_TRAINER_EXERCISE_READY") {
        setStartupSlow(false);
        setError(null);
        finishWarmup();
        setSaveState(signedIn ? "代码区已就绪；修改会自动同步" : "代码区已就绪；登录后可云端同步");
      }
      if (data.type === "AI_TRAINER_EXERCISE_ERROR" && data.message) {
        setStartupSlow(true);
        setError(`题目环境准备失败：${data.message}`);
      }
      if (data.type === "AI_TRAINER_KERNEL_ERROR" && data.message) {
        setStartupSlow(true);
        setError(`Python 内核启动失败：${data.message}`);
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      cancelled = true;
      window.clearTimeout(connectionTimer);
      window.removeEventListener("message", onMessage);
      if (startupTimer) clearTimeout(startupTimer);
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
      if (snapshotRef.current) clearTimeout(snapshotRef.current);
    };
  }, [configureFillReferences, finishWarmup, iframeGeneration, iframeId, loadDrafts, notebookPath, signedIn, snapshotAndSchedule]);

  async function resolveConflict(choice: "local" | "cloud") {
    if (!conflict) return;
    const selected = choice === "local" ? conflict.local : conflict.cloud;
    await applyNotebook(selected);
    setConflict(null);
    initializedRef.current = true;
    if (choice === "local" && signedIn) await saveDraft(selected, conflict.revision);
    else setSaveState("已采用云端 Notebook");
  }

  async function restoreOriginalTemplate() {
    setError(null);
    try {
      const template = await loadTemplate();
      await applyNotebook(template);
      initializedRef.current = true;
      setConflict(null);
      setConfirmRestore(false);
      setSaveState(signedIn ? "已恢复原始模板，正在更新云端草稿…" : "已恢复原始模板并保存到本机");
      if (signedIn) await saveDraft(template, revisionRef.current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function reloadEnvironment() {
    setError(null);
    setReady(false);
    setStartupSlow(false);
    kernelRef.current = "unknown";
    setKernel("unknown");
    setWarmupStage("shell");
    setSaveState("正在重新加载 JupyterLite 环境…");
    setIframeGeneration((value) => value + 1);
  }

  async function retryPreparation() {
    if (!bridgeRef.current) return;
    setError(null);
    setStartupSlow(true);
    setSaveState("正在重试题目依赖与素材准备…");
    try {
      await bridgeRef.current.execute("ai-trainer:prepare-exercise", { path: notebookPath });
      setStartupSlow(false);
      setSaveState(signedIn ? "代码区已就绪；修改会自动同步" : "代码区已就绪；登录后可云端同步");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(`题目环境准备失败：${message}`);
    }
  }

  async function execute(command: string) {
    if (!bridgeRef.current) return;
    setError(null);
    try {
      if (command === "ai-trainer:restart-and-prepare") {
        setWarmupStage("kernel");
        setStartupSlow(true);
        setSaveState("正在重启 Python 内核并重新准备题目环境…");
      }
      await bridgeRef.current.execute(command, { path: notebookPath });
      if (command === "ai-trainer:restart-and-prepare") {
        setStartupSlow(false);
        finishWarmup();
        setSaveState(signedIn ? "代码区已就绪；修改会自动同步" : "代码区已就绪；登录后可云端同步");
      }
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function toggleFillReview() {
    if (!bridgeRef.current) return;
    setError(null);
    const next = !(fillReview?.visible ?? false);
    try {
      const args = { path: notebookPath, visible: next } as unknown as Parameters<Bridge["execute"]>[1];
      const result = await bridgeRef.current.execute("ai-trainer:toggle-fill-review", args) as { visible?: boolean; summary?: FillReviewSummary } | undefined;
      if (result?.summary) setFillReview({ visible: Boolean(result.visible), summary: result.summary });
      else setFillReview({ visible: next, summary: { total: 0, exact: 0, different: 0, empty: 0 } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function downloadNotebook() {
    try {
      const notebook = withoutInfrastructureCells(await readNotebook());
      const url = URL.createObjectURL(new Blob([JSON.stringify(notebook, null, 1)], { type: "application/x-ipynb+json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${task.code}.ipynb`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  const kernelUsable = ready && (kernel === "idle" || kernel === "busy");

  return <div className="jupyter-lab-layout">
    <section id={`lab-work-${task.code}`} className={`jupyter-shell ${activeSurface === "notebook" ? "is-active" : "is-inactive"}`} role="tabpanel" aria-label="Notebook 作答区">
      <div className="jupyter-host-toolbar">
        <div><span className={`kernel-dot ${kernel === "idle" ? "ready" : kernel === "busy" || kernel === "starting" ? "running" : "idle"}`}></span><b>{ready ? kernelLabel(kernel) : "正在加载 JupyterLite…"}</b><small>{saveState} · 修订 {revision}</small></div>
        <div className="lab-toolbar-actions" aria-label="Notebook 操作">
          <button className="button button-small" disabled={!kernelUsable} onClick={() => void execute("notebook:run-all-cells")}>▶ 运行全部</button>
          <button className="button button-small" disabled={!ready} onClick={() => void saveDraft()}>{signedIn ? "云端保存" : "登录并保存"}</button>
          {!examMode && fillReferences.length > 0 && <button className={`button button-small ${fillReview?.visible ? "is-active" : ""}`} disabled={!ready} aria-pressed={Boolean(fillReview?.visible)} onClick={() => void toggleFillReview()}>{fillReview?.visible ? "隐藏答案" : "查看答案"}</button>}
          <span className="lab-toolbar-divider" aria-hidden="true"></span>
          <button className="button button-small" disabled={!kernelUsable} onClick={() => void execute("ai-trainer:restart-and-prepare")}>重启内核</button>
          <button className="button button-small" disabled={!ready} onClick={() => void downloadNotebook()}>导出 .ipynb</button>
          <button className="button button-small" onClick={reloadEnvironment}>重新加载环境</button>
          <button className="button button-small" disabled={!ready} onClick={() => setConfirmRestore(true)}>恢复原始模板</button>
          <a className="button button-small" href={fullNotebookUrl} target="_blank" rel="noreferrer">全屏打开 ↗</a>
        </div>
      </div>
      {error && <div className="jupyter-error" role="alert"><span>{error}</span>{error.startsWith("题目环境准备失败") && <button type="button" className="button button-small" onClick={() => void retryPreparation()}>重试准备</button>}</div>}
      {startupSlow && !error && !cold && <div className="jupyter-warning" role="status">Python 内核仍在准备。页面会保留当前环境，不再自动重载；若长时间没有响应，可手动点击“重新加载环境”。</div>}
      {fillReview?.visible && fillReview.summary.total > 0 && <div className="jupyter-fill-summary" role="status">
        <b>核对填空自查</b>
        <span className="fill-summary-chip is-exact">✓ 完全一致 {fillReview.summary.exact}</span>
        <span className="fill-summary-chip is-different">✗ 差异较大 {fillReview.summary.different}</span>
        {fillReview.summary.empty > 0 && <span className="fill-summary-chip is-empty">· 未填写 {fillReview.summary.empty}</span>}
        <small>共 {fillReview.summary.total} 空 · 自动比对仅供参考，最终以运行结果为准</small>
      </div>}
      <div className="mobile-lab-hint">手机端适合查看和轻量编辑；长时间编码建议横屏或使用“全屏打开”。</div>
      <div className="jupyter-frame-wrap">
        {cold && !error && <LabWarmupNotice stage={warmupStage} hasModel={hasModel} />}
        <iframe key={iframeGeneration} id={iframeId} className="jupyter-frame" src={`${notebookUrl}&attempt=${iframeGeneration}`} title={`${task.code} JupyterLite JupyterLab`} allow="clipboard-read; clipboard-write; fullscreen; cross-origin-isolated" />
      </div>
    </section>
    {!examMode && wordDeliverable && <section className={`lab-document-surface ${activeSurface === "document" ? "is-active" : "is-inactive"}`} role="tabpanel" aria-label={`${wordDeliverable.fileName} 作答区`}>
      <PracticalWordDeliverable task={task} userEmail={userEmail} />
    </section>}
    {conflict && <div className="conflict-dialog" role="dialog" aria-modal="true" aria-label="Notebook 草稿冲突"><div><p className="eyebrow">多设备 Notebook 冲突</p><h2>本机与云端版本均已保留</h2><p>选择本机版本会基于云端当前修订另存为新版本；选择云端版本会替换当前浏览器中的 Notebook。</p><div className="hero-actions"><button className="button button-primary" onClick={() => void resolveConflict("local")}>保留本机版本</button><button className="button button-quiet" onClick={() => void resolveConflict("cloud")}>采用云端版本</button></div></div></div>}
    {confirmRestore && <div className="conflict-dialog" role="dialog" aria-modal="true" aria-label="恢复原始 Notebook 模板"><div><p className="eyebrow">恢复原始模板</p><h2>用题目模板替换当前 Notebook？</h2><p>当前编辑内容会被原始模板替换。建议先导出 `.ipynb` 备份；恢复后会保存在本机，登录状态下也会更新云端草稿。</p><div className="hero-actions"><button className="button button-primary" onClick={() => void restoreOriginalTemplate()}>确认恢复</button><button className="button button-quiet" onClick={() => setConfirmRestore(false)}>取消</button></div></div></div>}
  </div>;
}
