import type {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from "@jupyterlab/application";
import { StateEffect, StateField, type Extension, type Range, type Text } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { ToolbarButton } from "@jupyterlab/apputils";
import {
  INotebookTracker,
  NotebookActions,
  type NotebookPanel
} from "@jupyterlab/notebook";
import { IKernelSpecs } from "@jupyterlite/services";

type NotebookJson = {
  cells: unknown[];
  metadata: Record<string, unknown>;
  nbformat: number;
  nbformat_minor: number;
};

type FillReferenceItem = {
  lineIndex: number;
  templateLine: string;
  referenceLine: string;
  answers: string[];
};

type FillReferenceCell = {
  cellId: string;
  items: FillReferenceItem[];
};

type FillReferenceState = {
  visible: boolean;
  items: FillReferenceItem[];
  decorations: DecorationSet;
};

type InjectableEditor = {
  editor: EditorView;
  injectExtension: (extension: Extension) => void;
};

const PYODIDE_KERNEL_PLUGIN_ID = "@jupyterlite/pyodide-kernel-extension:kernel";
const BLANK_PATTERN = /_{3,}/g;

const setFillReferenceItems = StateEffect.define<FillReferenceItem[]>();
const setFillReferenceVisible = StateEffect.define<boolean>();

class FillReferenceWidget extends WidgetType {
  constructor(readonly item: FillReferenceItem) {
    super();
  }

  eq(other: FillReferenceWidget): boolean {
    return this.item.referenceLine === other.item.referenceLine
      && this.item.answers.length === other.item.answers.length
      && this.item.answers.every((answer, index) => answer === other.item.answers[index]);
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("aside");
    wrapper.className = "ai-trainer-fill-reference";
    wrapper.setAttribute("aria-label", "本行参考填写");

    const label = document.createElement("b");
    label.textContent = "参考填写";
    wrapper.append(label);

    const values = document.createElement("span");
    values.className = "ai-trainer-fill-reference-values";
    this.item.answers.forEach((answer, index) => {
      const code = document.createElement("code");
      code.textContent = this.item.answers.length > 1 ? `空 ${index + 1}：${answer || "—"}` : answer || "—";
      values.append(code);
    });
    wrapper.append(values);

    const note = document.createElement("small");
    note.textContent = "参考写法 · 不自动判对错";
    wrapper.append(note);
    return wrapper;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function templateAnchors(templateLine: string): string[] {
  return templateLine.split(BLANK_PATTERN).map(value => value.trim()).filter(value => value.length >= 2);
}

function lineMatchesTemplate(templateLine: string, candidate: string): boolean {
  const anchors = templateAnchors(templateLine);
  if (anchors.length === 0) return false;
  let cursor = 0;
  for (const anchor of anchors) {
    const next = candidate.indexOf(anchor, cursor);
    if (next < 0) return false;
    cursor = next + anchor.length;
  }
  return true;
}

function locateReferenceLine(doc: Text, item: FillReferenceItem): number {
  const expectedLine = Math.min(Math.max(item.lineIndex + 1, 1), doc.lines);
  if (lineMatchesTemplate(item.templateLine, doc.line(expectedLine).text)) return expectedLine;

  let located = 0;
  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    if (!lineMatchesTemplate(item.templateLine, doc.line(lineNumber).text)) continue;
    if (located) return expectedLine;
    located = lineNumber;
  }
  return located || expectedLine;
}

function buildFillReferenceDecorations(doc: Text, items: FillReferenceItem[]): DecorationSet {
  const ranges: Array<Range<Decoration>> = items.map(item => {
    const line = doc.line(locateReferenceLine(doc, item));
    return Decoration.widget({ widget: new FillReferenceWidget(item), block: true, side: 1 }).range(line.to);
  });
  return Decoration.set(ranges, true);
}

const fillReferenceField = StateField.define<FillReferenceState>({
  create: () => ({ visible: false, items: [], decorations: Decoration.none }),
  update: (value, transaction) => {
    let visible = value.visible;
    let items = value.items;
    let changed = transaction.docChanged;
    for (const effect of transaction.effects) {
      if (effect.is(setFillReferenceItems)) {
        items = effect.value;
        changed = true;
      }
      if (effect.is(setFillReferenceVisible)) {
        visible = effect.value;
        changed = true;
      }
    }
    return changed
      ? { visible, items, decorations: visible ? buildFillReferenceDecorations(transaction.newDoc, items) : Decoration.none }
      : value;
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations)
});

const fillReferenceExtension: Extension = [
  fillReferenceField,
  EditorView.baseTheme({
    ".ai-trainer-fill-reference": {
      boxSizing: "border-box",
      width: "calc(100% - 16px)",
      display: "grid",
      gridTemplateColumns: "94px minmax(0, 1fr) auto",
      alignItems: "center",
      gap: "8px 12px",
      margin: "7px 8px 10px",
      padding: "10px 12px",
      border: "1px solid #d7c08b",
      borderLeft: "4px solid #a63a2a",
      borderRadius: "3px",
      background: "#fff8e8",
      color: "#102a43",
      fontFamily: '"Noto Sans SC", "Microsoft YaHei", sans-serif'
    },
    ".ai-trainer-fill-reference > b": {
      color: "#8b2f22",
      fontSize: "13px"
    },
    ".ai-trainer-fill-reference-values": {
      minWidth: "0",
      display: "flex",
      flexWrap: "wrap",
      gap: "6px"
    },
    ".ai-trainer-fill-reference-values code": {
      maxWidth: "100%",
      overflowX: "auto",
      padding: "4px 8px",
      border: "1px solid #bdc9d1",
      borderRadius: "3px",
      background: "#fff",
      color: "#15334a",
      fontFamily: 'Consolas, "SFMono-Regular", monospace',
      fontSize: "13px",
      lineHeight: "1.55",
      whiteSpace: "pre"
    },
    ".ai-trainer-fill-reference > small": {
      color: "#6f6654",
      fontSize: "11px",
      whiteSpace: "nowrap"
    },
    "@media (max-width: 720px)": {
      ".ai-trainer-fill-reference": {
        gridTemplateColumns: "1fr"
      },
      ".ai-trainer-fill-reference > small": {
        whiteSpace: "normal"
      }
    }
  })
];

function parseFillReferences(value: unknown): FillReferenceCell[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((cell): FillReferenceCell[] => {
    if (!cell || typeof cell !== "object") return [];
    const candidate = cell as Partial<FillReferenceCell>;
    if (typeof candidate.cellId !== "string" || !Array.isArray(candidate.items)) return [];
    const items = candidate.items.flatMap((item): FillReferenceItem[] => {
      if (!item || typeof item !== "object") return [];
      const reference = item as Partial<FillReferenceItem>;
      if (typeof reference.lineIndex !== "number"
        || typeof reference.templateLine !== "string"
        || typeof reference.referenceLine !== "string"
        || !Array.isArray(reference.answers)
        || !reference.answers.every(answer => typeof answer === "string")) return [];
      return [{
        lineIndex: reference.lineIndex,
        templateLine: reference.templateLine,
        referenceLine: reference.referenceLine,
        answers: reference.answers
      }];
    });
    return items.length ? [{ cellId: candidate.cellId, items }] : [];
  });
}

function targetPath(args: Readonly<Record<string, unknown>>): string | undefined {
  return typeof args.path === "string" && args.path ? args.path : undefined;
}

function activePanel(tracker: INotebookTracker, path?: string): NotebookPanel {
  let panel = path && tracker.currentWidget?.context.path === path ? tracker.currentWidget : null;
  if (!panel && path) {
    tracker.forEach(candidate => {
      if (!panel && candidate.context.path === path) panel = candidate;
    });
  }
  panel ??= tracker.currentWidget;
  if (!panel?.content.model) {
    throw new Error(path ? `尚未打开本题 Notebook：${path}` : "当前没有可操作的 Notebook");
  }
  return panel;
}

function isNotebookJson(value: unknown): value is NotebookJson {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NotebookJson>;
  return Array.isArray(candidate.cells)
    && typeof candidate.nbformat === "number"
    && typeof candidate.nbformat_minor === "number";
}

function notifyParent(type: string, detail: Record<string, unknown> = {}): void {
  if (window.parent === window) return;
  window.parent.postMessage({ type, ...detail }, window.location.origin);
}

async function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = 4000): Promise<T> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = window.setTimeout(() => reject(new Error(`${label} 超时`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

const plugin: JupyterFrontEndPlugin<void> = {
  id: "ai-trainer-jupyterlite:bridge",
  autoStart: true,
  requires: [INotebookTracker, IKernelSpecs],
  description: "Connects JupyterLite notebooks with the preparation site's cloud draft service.",
  activate: (app: JupyterFrontEnd, tracker: INotebookTracker, kernelSpecs: IKernelSpecs) => {
    const kernelStarts = new WeakMap<NotebookPanel, Promise<{ status: string; name: string }>>();
    const preparedPanels = new WeakSet<NotebookPanel>();
    const preparationRuns = new WeakMap<NotebookPanel, Promise<void>>();
    const examMode = new URLSearchParams(window.location.search).get("exam") === "1";
    const panelFillReferences = new WeakMap<NotebookPanel, FillReferenceCell[]>();
    const panelFillVisible = new WeakMap<NotebookPanel, boolean>();
    const fillReferenceButtons = new WeakMap<NotebookPanel, ToolbarButton>();
    const injectedEditors = new WeakSet<EditorView>();

    const preparationFailure = (cells: Array<{ model: { toJSON: () => unknown } }>): string | null => {
      for (const cell of cells) {
        const json = cell.model.toJSON() as { outputs?: Array<Record<string, unknown>> };
        for (const output of json.outputs ?? []) {
          if (output.output_type !== "error") continue;
          const name = typeof output.ename === "string" ? output.ename : "Python 错误";
          const value = typeof output.evalue === "string" ? output.evalue : "";
          return `${name}${value ? `：${value}` : ""}`;
        }
      }
      return null;
    };

    const applyFillReferences = async (panel: NotebookPanel, visible: boolean): Promise<number> => {
      const references = panelFillReferences.get(panel) ?? [];
      const byCellId = new Map(references.map(reference => [reference.cellId, reference.items]));
      await Promise.all(panel.content.widgets.map(async cell => {
        await cell.ready;
        const cellId = cell.model.getMetadata("ai_trainer_cell_id");
        const items = typeof cellId === "string" ? byCellId.get(cellId) ?? [] : [];
        const editor = cell.editor as unknown as InjectableEditor | null;
        if (!editor || typeof editor.injectExtension !== "function" || !editor.editor || typeof editor.editor.dispatch !== "function") return;
        const view = editor.editor;
        if (items.length === 0 && !injectedEditors.has(view)) return;
        if (!injectedEditors.has(view)) {
          editor.injectExtension(fillReferenceExtension);
          injectedEditors.add(view);
        }
        view.dispatch({
          effects: [
            setFillReferenceItems.of(items),
            setFillReferenceVisible.of(visible && items.length > 0)
          ]
        });
      }));
      return references.reduce((total, reference) => total + reference.items.length, 0);
    };

    const hideInfrastructureCells = (panel: NotebookPanel): void => {
      panel.content.widgets.forEach(cell => {
        const tags = cell.model.getMetadata("tags");
        const infrastructure = Array.isArray(tags) && tags.some(tag => tag === "ai-trainer-setup" || tag === "ai-trainer-onnx");
        cell.node.style.display = infrastructure ? "none" : "";
        if (infrastructure) cell.node.setAttribute("aria-hidden", "true");
        else cell.node.removeAttribute("aria-hidden");
      });
    };

    const concealRenderedRubric = (panel: NotebookPanel): void => {
      if (!examMode) return;
      panel.content.node.querySelectorAll("h2").forEach(heading => {
        if (heading.textContent?.trim() !== "评分点") return;
        (heading as HTMLElement).style.display = "none";
        let sibling = heading.nextElementSibling;
        while (sibling && sibling.tagName !== "H2") {
          (sibling as HTMLElement).style.display = "none";
          sibling = sibling.nextElementSibling;
        }
      });
      panel.content.node.querySelectorAll("li").forEach(item => {
        if (item.textContent?.includes("评分表是核对清单")) (item as HTMLElement).style.display = "none";
      });
      panel.content.node.querySelectorAll("table").forEach(table => {
        const text = table.textContent ?? "";
        if (text.includes("评分点") && text.includes("方式")) (table as HTMLElement).style.display = "none";
      });
      panel.content.node.querySelectorAll("th").forEach(header => {
        if (header.textContent?.trim() === "评分点") {
          const table = header.closest("table");
          if (table) (table as HTMLElement).style.display = "none";
        }
      });
    };

    const preferredKernel = async (): Promise<string> => {
      await withTimeout(app.started, "JupyterLite 启动", 15000);
      // Always await activation. During federated startup a plugin can already be
      // marked active while its activation promise is still registering the
      // Python kernelspec; merely checking isPluginActivated() races that work.
      await withTimeout(app.activatePlugin(PYODIDE_KERNEL_PLUGIN_ID), "Pyodide 扩展激活", 15000);
      await withTimeout(app.serviceManager.kernelspecs.ready, "内核清单准备", 15000);
      const deadline = Date.now() + 30000;
      let observed: string[] = [];
      while (Date.now() < deadline) {
        await withTimeout(app.serviceManager.kernelspecs.refreshSpecs(), "刷新内核清单", 5000);
        const registered = kernelSpecs.specs?.kernelspecs ?? {};
        const published = app.serviceManager.kernelspecs.specs?.kernelspecs ?? {};
        observed = [...new Set([...Object.keys(registered), ...Object.keys(published)])];
        const preferred = observed.includes("python") ? "python" : observed.find(name => name.toLowerCase().includes("pyodide"));
        if (preferred) return preferred;
        await new Promise(resolve => window.setTimeout(resolve, 500));
      }
      throw new Error(`Python (Pyodide) 内核未能注册${observed.length ? `（当前仅有：${observed.join("、")}）` : "（内核清单为空）"}`);
    };

    app.commands.addCommand("ai-trainer:ensure-kernel", {
      label: "确保 Python 内核已启动",
      execute: async args => {
        const path = targetPath(args);
        const panel = activePanel(tracker, path);
        app.shell.activateById(panel.id);
        await withTimeout(panel.context.ready, "Notebook 准备", 15000);
        const existing = panel.sessionContext.session?.kernel;
        if (existing) {
          if (existing.status === "dead") throw new Error("Python 内核已停止，请重新加载环境");
          await withTimeout(existing.info, "Python 内核握手", 60000);
          return { status: existing.status, name: existing.name };
        }

        const inFlight = kernelStarts.get(panel);
        if (inFlight) return inFlight;

        const start = (async () => {
          const preferred = await preferredKernel();
          const afterRegistration = panel.sessionContext.session?.kernel;
          if (afterRegistration) return { status: afterRegistration.status, name: afterRegistration.name };
          notifyParent("AI_TRAINER_KERNEL_STATUS", { path: panel.context.path, status: "starting" });
          try {
            const kernel = await withTimeout(panel.sessionContext.changeKernel({ name: preferred }), "Python 内核启动", 60000);
            if (!kernel) throw new Error("Python 内核启动后未返回连接");
            await withTimeout(kernel.info, "Python 内核握手", 60000);
            const status = kernel?.status ?? "starting";
            notifyParent("AI_TRAINER_KERNEL_STATUS", { path: panel.context.path, status });
            return { status, name: preferred };
          } catch (error) {
            notifyParent("AI_TRAINER_KERNEL_ERROR", {
              path: panel.context.path,
              message: error instanceof Error ? error.message : String(error)
            });
            throw error;
          }
        })();
        kernelStarts.set(panel, start);
        try {
          return await start;
        } finally {
          if (kernelStarts.get(panel) === start) kernelStarts.delete(panel);
        }
      }
    });

    app.commands.addCommand("ai-trainer:get-notebook", {
      label: "读取完整 Notebook",
      execute: args => {
        const panel = activePanel(tracker, targetPath(args));
        app.shell.activateById(panel.id);
        const notebook = panel.content.model!.toJSON();
        return JSON.parse(JSON.stringify(notebook));
      }
    });

    app.commands.addCommand("ai-trainer:prepare-exercise", {
      label: "准备题目环境并定位到作答代码",
      execute: async args => {
        const path = targetPath(args);
        const panel = activePanel(tracker, path);
        app.shell.activateById(panel.id);
        await withTimeout(panel.context.ready, "Notebook 准备", 15000);
        await app.commands.execute("ai-trainer:ensure-kernel", { path: panel.context.path });

        const cells = panel.content.widgets;
        const hasTag = (index: number, tag: string): boolean => {
          const tags = cells[index]?.model.getMetadata("tags");
          return Array.isArray(tags) && tags.includes(tag);
        };
        const preparationCells = cells.filter((_cell, index) => hasTag(index, "ai-trainer-setup") || hasTag(index, "ai-trainer-onnx"));
        const exerciseIndex = cells.findIndex((_cell, index) => hasTag(index, "ai-trainer-exercise"));

        if (!preparedPanels.has(panel) && preparationCells.length > 0) {
          let preparation = preparationRuns.get(panel);
          if (!preparation) {
            preparation = (async () => {
              notifyParent("AI_TRAINER_EXERCISE_PREPARING", { path: panel.context.path });
              let lastFailure: string | null = null;
              for (let attempt = 1; attempt <= 2; attempt += 1) {
                const succeeded = await withTimeout(
                  NotebookActions.runCells(panel.content, preparationCells, panel.sessionContext),
                  "题目依赖与素材准备",
                  180000
                );
                if (succeeded) {
                  preparedPanels.add(panel);
                  return;
                }
                lastFailure = preparationFailure(preparationCells);
                if (attempt < 2) await new Promise(resolve => window.setTimeout(resolve, 1200));
              }
              throw new Error(lastFailure ?? "环境准备单元未能成功执行");
            })();
            preparationRuns.set(panel, preparation);
          }
          try {
            await preparation;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            notifyParent("AI_TRAINER_EXERCISE_ERROR", { path: panel.context.path, message });
            throw error;
          } finally {
            if (preparationRuns.get(panel) === preparation) preparationRuns.delete(panel);
          }
        }

        if (exerciseIndex >= 0) {
          const shell = app.shell as JupyterFrontEnd.IShell & { collapseLeft?: () => void };
          shell.collapseLeft?.();
          panel.content.activeCellIndex = exerciseIndex;
          await panel.content.scrollToCell(cells[exerciseIndex], "start");
        }
        notifyParent("AI_TRAINER_EXERCISE_READY", { path: panel.context.path, exerciseIndex });
        return { ok: true, path: panel.context.path, exerciseIndex };
      }
    });

    app.commands.addCommand("ai-trainer:set-notebook", {
      label: "载入云端 Notebook",
      execute: async args => {
        const notebook = args.notebook;
        if (!isNotebookJson(notebook)) {
          throw new Error("云端 Notebook 格式无效");
        }
        const panel = activePanel(tracker, targetPath(args));
        app.shell.activateById(panel.id);
        panel.content.model!.fromJSON(notebook);
        panel.context.model.dirty = true;
        await panel.context.save();
        return { ok: true, path: panel.context.path };
      }
    });

    app.commands.addCommand("ai-trainer:get-state", {
      label: "读取 Notebook 状态",
      execute: args => {
        const panel = activePanel(tracker, targetPath(args));
        app.shell.activateById(panel.id);
        return {
          path: panel.context.path,
          dirty: panel.context.model.dirty,
          kernel: panel.sessionContext.session?.kernel?.status ?? "unknown"
        };
      }
    });

    app.commands.addCommand("ai-trainer:set-fill-review", {
      label: "准备 Notebook 行内参考填写",
      execute: async args => {
        if (examMode) return { ok: false, count: 0 };
        const panel = activePanel(tracker, targetPath(args));
        const references = parseFillReferences(args.references);
        panelFillReferences.set(panel, references);
        panelFillVisible.set(panel, false);
        const button = fillReferenceButtons.get(panel);
        if (button) {
          button.enabled = references.length > 0;
          button.pressed = false;
        }
        const count = await applyFillReferences(panel, false);
        return { ok: true, count };
      }
    });

    const attached = new WeakSet<NotebookPanel>();
    const attachPanel = (panel: NotebookPanel) => {
      if (attached.has(panel)) return;
      attached.add(panel);
      const cloudButton = new ToolbarButton({
        label: "保存到备考站云端",
        tooltip: "将完整 .ipynb 草稿同步到备考站账号",
        onClick: () => notifyParent("AI_TRAINER_SAVE_REQUEST")
      } as ConstructorParameters<typeof ToolbarButton>[0]);
      panel.toolbar.insertItem(10, "ai-trainer-cloud-save", cloudButton);
      if (!examMode) {
        const fillReferenceButton = new ToolbarButton({
          label: "核对填空",
          tooltip: "在代码原位置显示参考填写；不会修改或运行 Notebook",
          pressedTooltip: "隐藏行内参考填写",
          enabled: Boolean(panelFillReferences.get(panel)?.length),
          pressed: false,
          className: "ai-trainer-fill-review-button",
          onClick: () => {
            const visible = !(panelFillVisible.get(panel) ?? false);
            panelFillVisible.set(panel, visible);
            fillReferenceButton.pressed = visible;
            void applyFillReferences(panel, visible).then(count => {
              notifyParent("AI_TRAINER_FILL_REVIEW_STATUS", { path: panel.context.path, visible, count });
            });
          }
        } as ConstructorParameters<typeof ToolbarButton>[0]);
        fillReferenceButtons.set(panel, fillReferenceButton);
        panel.toolbar.insertItem(9, "ai-trainer-fill-review", fillReferenceButton);
      }

      panel.context.model.contentChanged.connect(() => {
        hideInfrastructureCells(panel);
        notifyParent("AI_TRAINER_NOTEBOOK_CHANGED", { path: panel.context.path });
      });
      panel.sessionContext.statusChanged.connect((_context, status) => {
        notifyParent("AI_TRAINER_KERNEL_STATUS", { path: panel.context.path, status });
      });
      panel.context.ready.then(async () => {
        hideInfrastructureCells(panel);
        concealRenderedRubric(panel);
        if (examMode) {
          const observer = new MutationObserver(() => concealRenderedRubric(panel));
          observer.observe(panel.content.node, { childList: true, subtree: true });
          panel.disposed.connect(() => observer.disconnect());
        }
        notifyParent("AI_TRAINER_NOTEBOOK_READY", { path: panel.context.path });
        notifyParent("AI_TRAINER_KERNEL_STATUS", {
          path: panel.context.path,
          status: panel.sessionContext.session?.kernel?.status ?? "unknown"
        });
        if (window.parent === window) {
          await app.commands.execute("ai-trainer:prepare-exercise", { path: panel.context.path });
        }
      }).catch(() => undefined);
    };
    tracker.forEach(attachPanel);
    tracker.widgetAdded.connect((_sender, panel) => attachPanel(panel));

    app.started.then(() => notifyParent("AI_TRAINER_EXTENSION_READY"));
  }
};

const plugins = [plugin];

export default plugins;
