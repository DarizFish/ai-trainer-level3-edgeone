"use strict";
(self["webpackChunkai_trainer_jupyterlite"] = self["webpackChunkai_trainer_jupyterlite"] || []).push([["lib_index_js"],{

/***/ "./lib/index.js"
/*!**********************!*\
  !*** ./lib/index.js ***!
  \**********************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _codemirror_state__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @codemirror/state */ "webpack/sharing/consume/default/@codemirror/state");
/* harmony import */ var _codemirror_state__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_codemirror_state__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _codemirror_view__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @codemirror/view */ "webpack/sharing/consume/default/@codemirror/view");
/* harmony import */ var _codemirror_view__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_codemirror_view__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _jupyterlab_notebook__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @jupyterlab/notebook */ "webpack/sharing/consume/default/@jupyterlab/notebook");
/* harmony import */ var _jupyterlab_notebook__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(_jupyterlab_notebook__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var _jupyterlite_kernel__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @jupyterlite/kernel */ "webpack/sharing/consume/default/@jupyterlite/kernel");
/* harmony import */ var _jupyterlite_kernel__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(_jupyterlite_kernel__WEBPACK_IMPORTED_MODULE_3__);




const PYODIDE_KERNEL_PLUGIN_ID = "@jupyterlite/pyodide-kernel-extension:kernel";
// 内核启动要在 Worker 里下载并初始化约 9MB 的 pyodide.asm.wasm、标准库和若干
// wheel。同一条网络上实测就绪耗时在 30 秒到 56.5 秒之间浮动，原先的 60 秒上限
// 只剩几秒余量，网络稍差就会误报“握手超时”，而内核其实仍在正常加载。
const KERNEL_BOOT_TIMEOUT_MS = 180000;
const BLANK_PATTERN = /_{3,}/g;
// Collapse insignificant whitespace and unify quote style so trivially
// different spellings of the same code compare equal.
function normalizeCode(value) {
    return value
        .replaceAll('"', "'")
        .replace(/\s+/g, " ")
        .replaceAll(" (", "(")
        .replaceAll("( ", "(")
        .replaceAll(" )", ")")
        .replaceAll(" ,", ",")
        .replaceAll(", ", ",")
        .replaceAll(" .", ".")
        .replaceAll(". ", ".")
        .replaceAll(" :", ":")
        .replaceAll(" [", "[")
        .replaceAll("[ ", "[")
        .replaceAll(" ]", "]")
        .replaceAll(" =", "=")
        .replaceAll("= ", "=")
        .trim();
}
function classifyFill(userAnswer, referenceAnswer) {
    if (!userAnswer.trim())
        return "empty";
    if (normalizeCode(userAnswer) === normalizeCode(referenceAnswer))
        return "exact";
    return "different";
}
const VERDICT_META = {
    exact: { mark: "✓", label: "完全一致", className: "is-exact" },
    different: { mark: "✗", label: "与参考不同", className: "is-different" },
    empty: { mark: "·", label: "未填写", className: "is-empty" }
};
const setFillReferenceItems = _codemirror_state__WEBPACK_IMPORTED_MODULE_0__.StateEffect.define();
const setFillReferenceVisible = _codemirror_state__WEBPACK_IMPORTED_MODULE_0__.StateEffect.define();
function emptyFillSummary() {
    return { total: 0, exact: 0, different: 0, empty: 0 };
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, String.raw `\$&`);
}
// Given the template line (with ___ blanks) and the user's completed line,
// pull out what the user wrote in each blank. Returns one entry per blank, or
// null when the completed line no longer matches the template shape.
function extractBlankAnswers(templateLine, completedLine) {
    const matches = [...templateLine.matchAll(BLANK_PATTERN)];
    if (matches.length === 0)
        return [];
    let cursor = 0;
    let pattern = "^";
    for (const match of matches) {
        pattern += escapeRegExp(templateLine.slice(cursor, match.index));
        pattern += "(.*?)";
        cursor = (match.index ?? 0) + match[0].length;
    }
    pattern += `${escapeRegExp(templateLine.slice(cursor))}$`;
    const result = new RegExp(pattern).exec(completedLine);
    return result ? result.slice(1).map(value => value.trim()) : null;
}
// Compare the user's line against the reference for one template line and
// produce a per-blank verdict list. Falls back to "empty" verdicts when the
// user hasn't reshaped the line into the template yet.
function compareBlanks(item, userLine) {
    const userAnswers = userLine !== null ? extractBlankAnswers(item.templateLine, userLine) : null;
    return item.answers.map((reference, index) => {
        const user = userAnswers?.[index] ?? "";
        return { reference, user, verdict: classifyFill(user, reference) };
    });
}
// Rebuild a line from its template, filling the blank at fillIndex with its
// reference answer while preserving whatever the user already put in the other
// blanks. Used by the per-blank "填入参考" button.
function rebuildLineWithReference(item, userAnswers, fillIndex) {
    const segments = item.templateLine.split(BLANK_PATTERN);
    let result = segments[0] ?? "";
    for (let index = 0; index < item.answers.length; index += 1) {
        const value = index === fillIndex ? item.answers[index] : (userAnswers?.[index] ?? "");
        result += value + (segments[index + 1] ?? "");
    }
    return result;
}
// Write the reference answer for one blank into the live editor line, keeping
// the user's other blanks intact. Re-locates the line at click time so edits
// made after the widget rendered are respected.
function fillBlankIntoEditor(view, item, fillIndex) {
    const doc = view.state.doc;
    const line = doc.line(locateReferenceLine(doc, item));
    const userAnswers = extractBlankAnswers(item.templateLine, line.text);
    const rebuilt = rebuildLineWithReference(item, userAnswers, fillIndex);
    view.dispatch({ changes: { from: line.from, to: line.to, insert: rebuilt } });
}
class FillReferenceWidget extends _codemirror_view__WEBPACK_IMPORTED_MODULE_1__.WidgetType {
    item;
    comparisons;
    constructor(item, comparisons) {
        super();
        this.item = item;
        this.comparisons = comparisons;
    }
    eq(other) {
        return this.item.referenceLine === other.item.referenceLine
            && this.comparisons.length === other.comparisons.length
            && this.comparisons.every((cmp, index) => {
                const peer = other.comparisons[index];
                return cmp.reference === peer?.reference && cmp.user === peer?.user && cmp.verdict === peer?.verdict;
            });
    }
    toDOM(view) {
        // Outer host carries the vertical spacing as padding, not margin.
        // CodeMirror measures block-widget height with getBoundingClientRect,
        // which counts padding but ignores margin; a margin here would make the
        // editor under-measure every reference row and progressively offset the
        // pointer-to-position mapping for all lines below the first widget.
        const host = document.createElement("div");
        host.className = "ai-trainer-fill-reference-host";
        host.contentEditable = "false";
        const wrapper = document.createElement("aside");
        wrapper.className = "ai-trainer-fill-reference";
        wrapper.setAttribute("aria-label", "本行参考填写与自查");
        const multi = this.comparisons.length > 1;
        this.comparisons.forEach((cmp, index) => {
            const meta = VERDICT_META[cmp.verdict];
            const row = document.createElement("div");
            row.className = `ai-trainer-fill-row ${meta.className}`;
            const slot = document.createElement("span");
            slot.className = "ai-trainer-fill-slot";
            slot.textContent = multi ? `空 ${index + 1}` : "填空";
            row.append(slot);
            const verdict = document.createElement("span");
            verdict.className = "ai-trainer-fill-verdict";
            verdict.textContent = `${meta.mark} ${meta.label}`;
            row.append(verdict);
            const pair = document.createElement("span");
            pair.className = "ai-trainer-fill-pair";
            const mine = document.createElement("code");
            mine.className = "ai-trainer-fill-mine";
            mine.textContent = cmp.user || "（未填写）";
            pair.append(mine);
            const arrow = document.createElement("span");
            arrow.className = "ai-trainer-fill-arrow";
            arrow.textContent = "对照";
            pair.append(arrow);
            const ref = document.createElement("code");
            ref.className = "ai-trainer-fill-ref";
            ref.textContent = cmp.reference || "—";
            pair.append(ref);
            row.append(pair);
            const fill = document.createElement("button");
            fill.type = "button";
            fill.className = "ai-trainer-fill-apply";
            fill.textContent = "填入参考";
            fill.title = "把参考答案写入这一空";
            fill.disabled = cmp.verdict === "exact" || !cmp.reference;
            fill.addEventListener("click", () => fillBlankIntoEditor(view, this.item, index));
            row.append(fill);
            wrapper.append(row);
        });
        host.append(wrapper);
        return host;
    }
    ignoreEvent() {
        return true;
    }
}
function templateAnchors(templateLine) {
    return templateLine.split(BLANK_PATTERN).map(value => value.trim()).filter(value => value.length >= 2);
}
function lineMatchesTemplate(templateLine, candidate) {
    const anchors = templateAnchors(templateLine);
    if (anchors.length === 0)
        return false;
    let cursor = 0;
    for (const anchor of anchors) {
        const next = candidate.indexOf(anchor, cursor);
        if (next < 0)
            return false;
        cursor = next + anchor.length;
    }
    return true;
}
function locateReferenceLine(doc, item) {
    const expectedLine = Math.min(Math.max(item.lineIndex + 1, 1), doc.lines);
    if (lineMatchesTemplate(item.templateLine, doc.line(expectedLine).text))
        return expectedLine;
    // The expected line no longer matches (the user inserted or removed lines).
    // Collect every line that still matches the template anchors and pick the one
    // closest to the expected position; that is the safest guess when several
    // lines look alike. Only fall back to the expected line when nothing matches.
    let best = 0;
    for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
        if (!lineMatchesTemplate(item.templateLine, doc.line(lineNumber).text))
            continue;
        if (best === 0 || Math.abs(lineNumber - expectedLine) < Math.abs(best - expectedLine))
            best = lineNumber;
    }
    return best || expectedLine;
}
function buildFillReferenceDecorations(doc, items) {
    const ranges = items.map(item => {
        const lineNumber = locateReferenceLine(doc, item);
        const line = doc.line(lineNumber);
        const comparisons = compareBlanks(item, line.text);
        return _codemirror_view__WEBPACK_IMPORTED_MODULE_1__.Decoration.widget({ widget: new FillReferenceWidget(item, comparisons), block: true, side: 1 }).range(line.to);
    });
    return _codemirror_view__WEBPACK_IMPORTED_MODULE_1__.Decoration.set(ranges, true);
}
const fillReferenceField = _codemirror_state__WEBPACK_IMPORTED_MODULE_0__.StateField.define({
    create: () => ({ visible: false, items: [], decorations: _codemirror_view__WEBPACK_IMPORTED_MODULE_1__.Decoration.none }),
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
            ? { visible, items, decorations: visible ? buildFillReferenceDecorations(transaction.newDoc, items) : _codemirror_view__WEBPACK_IMPORTED_MODULE_1__.Decoration.none }
            : value;
    },
    provide: field => _codemirror_view__WEBPACK_IMPORTED_MODULE_1__.EditorView.decorations.from(field, value => value.decorations)
});
const fillReferenceExtension = [
    fillReferenceField,
    _codemirror_view__WEBPACK_IMPORTED_MODULE_1__.EditorView.baseTheme({
        // Make the editor viewport a size container so the reference widget can be
        // sized to the visible width (100cqw) instead of the content width. Without
        // this the widget stretches to the longest code line and its right-aligned
        // "填入参考" button ends up off-screen until the user scrolls horizontally.
        ".cm-scroller": {
            containerType: "inline-size"
        },
        ".ai-trainer-fill-reference-host": {
            boxSizing: "border-box",
            // Pin to the left edge of the visible viewport and cap width to it, so
            // the widget (and its button) stay in view no matter how wide the code is.
            position: "sticky",
            left: "0",
            width: "100cqw",
            // Vertical spacing lives here as padding so CodeMirror measures it as
            // part of the block-widget height (getBoundingClientRect counts padding
            // but ignores margin); a margin here would offset pointer selection for
            // every line below the widget.
            padding: "6px 8px 8px",
            userSelect: "none",
            WebkitUserSelect: "none",
            pointerEvents: "none"
        },
        ".ai-trainer-fill-reference": {
            boxSizing: "border-box",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            padding: "8px 10px",
            border: "1px solid var(--jp-border-color2, #d9d9d9)",
            borderRadius: "var(--jp-border-radius, 4px)",
            background: "var(--jp-layout-color2, #f5f5f5)",
            color: "var(--jp-content-font-color1, #1a1a1a)",
            fontFamily: "var(--jp-ui-font-family, system-ui, sans-serif)",
            fontSize: "var(--jp-ui-font-size1, 13px)"
        },
        ".ai-trainer-fill-row": {
            display: "grid",
            gridTemplateColumns: "auto auto minmax(0, 1fr) auto",
            alignItems: "center",
            gap: "8px",
            padding: "4px 6px",
            borderRadius: "var(--jp-border-radius, 4px)",
            borderLeft: "3px solid var(--jp-border-color2, #d9d9d9)",
            background: "var(--jp-layout-color1, #ffffff)"
        },
        ".ai-trainer-fill-row.is-exact": {
            borderLeftColor: "var(--jp-success-color1, #2e7d32)"
        },
        ".ai-trainer-fill-row.is-different": {
            borderLeftColor: "var(--jp-error-color1, #d32f2f)"
        },
        ".ai-trainer-fill-row.is-empty": {
            borderLeftColor: "var(--jp-border-color1, #bdbdbd)"
        },
        ".ai-trainer-fill-slot": {
            fontSize: "var(--jp-ui-font-size0, 11px)",
            fontWeight: "600",
            color: "var(--jp-ui-font-color2, #616161)",
            whiteSpace: "nowrap"
        },
        ".ai-trainer-fill-verdict": {
            fontSize: "var(--jp-ui-font-size0, 11px)",
            fontWeight: "600",
            whiteSpace: "nowrap"
        },
        ".is-exact .ai-trainer-fill-verdict": { color: "var(--jp-success-color1, #2e7d32)" },
        ".is-different .ai-trainer-fill-verdict": { color: "var(--jp-error-color1, #d32f2f)" },
        ".is-empty .ai-trainer-fill-verdict": { color: "var(--jp-ui-font-color3, #9e9e9e)" },
        ".ai-trainer-fill-pair": {
            minWidth: "0",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "6px"
        },
        ".ai-trainer-fill-pair code": {
            maxWidth: "100%",
            overflowX: "auto",
            padding: "2px 6px",
            borderRadius: "var(--jp-border-radius, 4px)",
            fontFamily: "var(--jp-code-font-family, monospace)",
            fontSize: "var(--jp-code-font-size, 13px)",
            lineHeight: "1.4",
            whiteSpace: "pre",
            // The host disables pointer/selection so mouse drags in the editor pass
            // straight through the widget. Re-enable both on the code snippets only,
            // so the user can select and copy their own answer or the reference
            // without the surrounding labels joining the selection.
            pointerEvents: "auto",
            userSelect: "text",
            WebkitUserSelect: "text",
            cursor: "text"
        },
        ".ai-trainer-fill-mine": {
            background: "var(--jp-layout-color2, #f0f0f0)",
            color: "var(--jp-content-font-color2, #424242)",
            border: "1px solid var(--jp-border-color2, #e0e0e0)"
        },
        ".is-different .ai-trainer-fill-mine, .is-empty .ai-trainer-fill-mine": {
            color: "var(--jp-ui-font-color3, #9e9e9e)",
            fontStyle: "italic"
        },
        ".ai-trainer-fill-arrow": {
            fontSize: "var(--jp-ui-font-size0, 11px)",
            color: "var(--jp-ui-font-color3, #9e9e9e)",
            whiteSpace: "nowrap"
        },
        ".ai-trainer-fill-ref": {
            background: "var(--jp-brand-color3, #e3f2fd)",
            color: "var(--jp-content-font-color1, #1a1a1a)",
            border: "1px solid var(--jp-brand-color2, #90caf9)"
        },
        ".ai-trainer-fill-apply": {
            justifySelf: "end",
            whiteSpace: "nowrap",
            padding: "2px 10px",
            borderRadius: "var(--jp-border-radius, 4px)",
            border: "1px solid var(--jp-brand-color1, #1976d2)",
            background: "var(--jp-brand-color1, #1976d2)",
            color: "var(--jp-ui-inverse-font-color1, #ffffff)",
            fontSize: "var(--jp-ui-font-size0, 11px)",
            fontWeight: "600",
            cursor: "pointer",
            pointerEvents: "auto"
        },
        ".ai-trainer-fill-apply:hover:not(:disabled)": {
            background: "var(--jp-brand-color0, #0d47a1)",
            borderColor: "var(--jp-brand-color0, #0d47a1)"
        },
        ".ai-trainer-fill-apply:disabled": {
            opacity: "0.4",
            cursor: "default"
        },
        "@media (max-width: 720px)": {
            ".ai-trainer-fill-row": {
                gridTemplateColumns: "1fr"
            },
            ".ai-trainer-fill-apply": {
                justifySelf: "start"
            }
        }
    })
];
function parseFillReferences(value) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((cell) => {
        if (!cell || typeof cell !== "object")
            return [];
        const candidate = cell;
        if (typeof candidate.cellId !== "string" || !Array.isArray(candidate.items))
            return [];
        const items = candidate.items.flatMap((item) => {
            if (!item || typeof item !== "object")
                return [];
            const reference = item;
            if (typeof reference.lineIndex !== "number"
                || typeof reference.templateLine !== "string"
                || typeof reference.referenceLine !== "string"
                || !Array.isArray(reference.answers)
                || !reference.answers.every(answer => typeof answer === "string"))
                return [];
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
function targetPath(args) {
    return typeof args.path === "string" && args.path ? args.path : undefined;
}
function activePanel(tracker, path) {
    let panel = path && tracker.currentWidget?.context.path === path ? tracker.currentWidget : null;
    if (!panel && path) {
        tracker.forEach(candidate => {
            if (!panel && candidate.context.path === path)
                panel = candidate;
        });
    }
    panel ??= tracker.currentWidget;
    if (!panel?.content.model) {
        throw new Error(path ? `尚未打开本题 Notebook：${path}` : "当前没有可操作的 Notebook");
    }
    return panel;
}
function isNotebookJson(value) {
    if (!value || typeof value !== "object")
        return false;
    const candidate = value;
    return Array.isArray(candidate.cells)
        && typeof candidate.nbformat === "number"
        && typeof candidate.nbformat_minor === "number";
}
function notifyParent(type, detail = {}) {
    if (window.parent === window)
        return;
    window.parent.postMessage({ type, ...detail }, window.location.origin);
}
async function withTimeout(promise, label, timeoutMs = 4000) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_resolve, reject) => {
                timer = window.setTimeout(() => reject(new Error(`${label} 超时`)), timeoutMs);
            })
        ]);
    }
    finally {
        if (timer !== undefined)
            window.clearTimeout(timer);
    }
}
const plugin = {
    id: "ai-trainer-jupyterlite:bridge",
    autoStart: true,
    requires: [_jupyterlab_notebook__WEBPACK_IMPORTED_MODULE_2__.INotebookTracker, _jupyterlite_kernel__WEBPACK_IMPORTED_MODULE_3__.IKernelSpecs],
    description: "Connects JupyterLite notebooks with the preparation site's cloud draft service.",
    activate: (app, tracker, kernelSpecs) => {
        const kernelStarts = new WeakMap();
        const preparedPanels = new WeakSet();
        const preparationRuns = new WeakMap();
        const examMode = new URLSearchParams(window.location.search).get("exam") === "1";
        const panelFillReferences = new WeakMap();
        const panelFillVisible = new WeakMap();
        const injectedEditors = new WeakSet();
        const preparationFailure = (cells) => {
            for (const cell of cells) {
                const json = cell.model.toJSON();
                for (const output of json.outputs ?? []) {
                    if (output.output_type !== "error")
                        continue;
                    const name = typeof output.ename === "string" ? output.ename : "Python 错误";
                    const value = typeof output.evalue === "string" ? output.evalue : "";
                    return `${name}${value ? `：${value}` : ""}`;
                }
            }
            return null;
        };
        const applyFillReferences = async (panel, visible) => {
            const references = panelFillReferences.get(panel) ?? [];
            const byCellId = new Map(references.map(reference => [reference.cellId, reference.items]));
            const summary = emptyFillSummary();
            await Promise.all(panel.content.widgets.map(async (cell) => {
                await cell.ready;
                const cellId = cell.model.getMetadata("ai_trainer_cell_id");
                const items = typeof cellId === "string" ? byCellId.get(cellId) ?? [] : [];
                const editor = cell.editor;
                if (!editor || typeof editor.injectExtension !== "function" || !editor.editor || typeof editor.editor.dispatch !== "function")
                    return;
                const view = editor.editor;
                if (items.length === 0 && !injectedEditors.has(view))
                    return;
                if (!injectedEditors.has(view)) {
                    editor.injectExtension(fillReferenceExtension);
                    injectedEditors.add(view);
                }
                // Tally verdicts from the live document so the summary matches exactly
                // what the widgets render for this cell.
                for (const item of items) {
                    const line = view.state.doc.line(locateReferenceLine(view.state.doc, item));
                    for (const comparison of compareBlanks(item, line.text)) {
                        summary.total += 1;
                        summary[comparison.verdict] += 1;
                    }
                }
                view.dispatch({
                    effects: [
                        setFillReferenceItems.of(items),
                        setFillReferenceVisible.of(visible && items.length > 0)
                    ]
                });
            }));
            return summary;
        };
        const hideInfrastructureCells = (panel) => {
            panel.content.widgets.forEach(cell => {
                const tags = cell.model.getMetadata("tags");
                const infrastructure = Array.isArray(tags) && tags.some(tag => tag === "ai-trainer-setup" || tag === "ai-trainer-onnx");
                cell.node.style.display = infrastructure ? "none" : "";
                if (infrastructure)
                    cell.node.setAttribute("aria-hidden", "true");
                else
                    cell.node.removeAttribute("aria-hidden");
            });
        };
        const concealRenderedRubric = (panel) => {
            if (!examMode)
                return;
            panel.content.node.querySelectorAll("h2").forEach(heading => {
                if (heading.textContent?.trim() !== "评分点")
                    return;
                heading.style.display = "none";
                let sibling = heading.nextElementSibling;
                while (sibling && sibling.tagName !== "H2") {
                    sibling.style.display = "none";
                    sibling = sibling.nextElementSibling;
                }
            });
            panel.content.node.querySelectorAll("li").forEach(item => {
                if (item.textContent?.includes("评分表是核对清单"))
                    item.style.display = "none";
            });
            panel.content.node.querySelectorAll("table").forEach(table => {
                const text = table.textContent ?? "";
                if (text.includes("评分点") && text.includes("方式"))
                    table.style.display = "none";
            });
            panel.content.node.querySelectorAll("th").forEach(header => {
                if (header.textContent?.trim() === "评分点") {
                    const table = header.closest("table");
                    if (table)
                        table.style.display = "none";
                }
            });
        };
        const preferredKernel = async () => {
            await withTimeout(app.started, "JupyterLite 启动", 15000);
            // Always await activation. During federated startup a plugin can already be
            // marked active while its activation promise is still registering the
            // Python kernelspec; merely checking isPluginActivated() races that work.
            await withTimeout(app.activatePlugin(PYODIDE_KERNEL_PLUGIN_ID), "Pyodide 扩展激活", 15000);
            await withTimeout(app.serviceManager.kernelspecs.ready, "内核清单准备", 15000);
            const deadline = Date.now() + 30000;
            let observed = [];
            while (Date.now() < deadline) {
                await withTimeout(app.serviceManager.kernelspecs.refreshSpecs(), "刷新内核清单", 5000);
                const registered = kernelSpecs.specs?.kernelspecs ?? {};
                const published = app.serviceManager.kernelspecs.specs?.kernelspecs ?? {};
                observed = [...new Set([...Object.keys(registered), ...Object.keys(published)])];
                const preferred = observed.includes("python") ? "python" : observed.find(name => name.toLowerCase().includes("pyodide"));
                if (preferred)
                    return preferred;
                await new Promise(resolve => window.setTimeout(resolve, 500));
            }
            throw new Error(`Python (Pyodide) 内核未能注册${observed.length ? `（当前仅有：${observed.join("、")}）` : "（内核清单为空）"}`);
        };
        app.commands.addCommand("ai-trainer:ensure-kernel", {
            label: "确保 Python 内核已启动",
            execute: async (args) => {
                const path = targetPath(args);
                const panel = activePanel(tracker, path);
                app.shell.activateById(panel.id);
                await withTimeout(panel.context.ready, "Notebook 准备", 15000);
                const existing = panel.sessionContext.session?.kernel;
                if (existing) {
                    if (existing.status === "dead")
                        throw new Error("Python 内核已停止，请重新加载环境");
                    await withTimeout(existing.info, "Python 内核握手", KERNEL_BOOT_TIMEOUT_MS);
                    return { status: existing.status, name: existing.name };
                }
                const inFlight = kernelStarts.get(panel);
                if (inFlight)
                    return inFlight;
                const start = (async () => {
                    const preferred = await preferredKernel();
                    const afterRegistration = panel.sessionContext.session?.kernel;
                    if (afterRegistration)
                        return { status: afterRegistration.status, name: afterRegistration.name };
                    notifyParent("AI_TRAINER_KERNEL_STATUS", { path: panel.context.path, status: "starting" });
                    try {
                        const kernel = await withTimeout(panel.sessionContext.changeKernel({ name: preferred }), "Python 内核启动", KERNEL_BOOT_TIMEOUT_MS);
                        if (!kernel)
                            throw new Error("Python 内核启动后未返回连接");
                        await withTimeout(kernel.info, "Python 内核握手", KERNEL_BOOT_TIMEOUT_MS);
                        const status = kernel?.status ?? "starting";
                        notifyParent("AI_TRAINER_KERNEL_STATUS", { path: panel.context.path, status });
                        return { status, name: preferred };
                    }
                    catch (error) {
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
                }
                finally {
                    if (kernelStarts.get(panel) === start)
                        kernelStarts.delete(panel);
                }
            }
        });
        app.commands.addCommand("ai-trainer:get-notebook", {
            label: "读取完整 Notebook",
            execute: args => {
                const panel = activePanel(tracker, targetPath(args));
                app.shell.activateById(panel.id);
                const notebook = panel.content.model.toJSON();
                return JSON.parse(JSON.stringify(notebook));
            }
        });
        app.commands.addCommand("ai-trainer:prepare-exercise", {
            label: "准备题目环境并定位到作答代码",
            execute: async (args) => {
                const path = targetPath(args);
                const panel = activePanel(tracker, path);
                app.shell.activateById(panel.id);
                await withTimeout(panel.context.ready, "Notebook 准备", 15000);
                await app.commands.execute("ai-trainer:ensure-kernel", { path: panel.context.path });
                const cells = panel.content.widgets;
                const hasTag = (index, tag) => {
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
                            let lastFailure = null;
                            for (let attempt = 1; attempt <= 2; attempt += 1) {
                                const succeeded = await withTimeout(_jupyterlab_notebook__WEBPACK_IMPORTED_MODULE_2__.NotebookActions.runCells(panel.content, preparationCells, panel.sessionContext), "题目依赖与素材准备", 180000);
                                if (succeeded) {
                                    preparedPanels.add(panel);
                                    return;
                                }
                                lastFailure = preparationFailure(preparationCells);
                                if (attempt < 2)
                                    await new Promise(resolve => window.setTimeout(resolve, 1200));
                            }
                            throw new Error(lastFailure ?? "环境准备单元未能成功执行");
                        })();
                        preparationRuns.set(panel, preparation);
                    }
                    try {
                        await preparation;
                    }
                    catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        notifyParent("AI_TRAINER_EXERCISE_ERROR", { path: panel.context.path, message });
                        throw error;
                    }
                    finally {
                        if (preparationRuns.get(panel) === preparation)
                            preparationRuns.delete(panel);
                    }
                }
                if (exerciseIndex >= 0) {
                    const shell = app.shell;
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
            execute: async (args) => {
                const notebook = args.notebook;
                if (!isNotebookJson(notebook)) {
                    throw new Error("云端 Notebook 格式无效");
                }
                const panel = activePanel(tracker, targetPath(args));
                app.shell.activateById(panel.id);
                panel.content.model.fromJSON(notebook);
                panel.context.model.dirty = true;
                await panel.context.save();
                // fromJSON rebuilds every cell widget, so re-hide the infrastructure
                // cells here rather than relying on the contentChanged listener, whose
                // timing races the new widgets' DOM (otherwise the setup cell reappears
                // after "恢复原始模板").
                await Promise.all(panel.content.widgets.map(cell => cell.ready));
                hideInfrastructureCells(panel);
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
            execute: async (args) => {
                if (examMode)
                    return { ok: false, summary: emptyFillSummary() };
                const panel = activePanel(tracker, targetPath(args));
                const references = parseFillReferences(args.references);
                panelFillReferences.set(panel, references);
                panelFillVisible.set(panel, false);
                const summary = await applyFillReferences(panel, false);
                return { ok: true, summary };
            }
        });
        app.commands.addCommand("ai-trainer:toggle-fill-review", {
            label: "显示或隐藏参考答案",
            execute: async (args) => {
                if (examMode)
                    return { ok: false, visible: false, summary: emptyFillSummary() };
                const panel = activePanel(tracker, targetPath(args));
                const visible = typeof args.visible === "boolean"
                    ? args.visible
                    : !(panelFillVisible.get(panel) ?? false);
                panelFillVisible.set(panel, visible);
                const summary = await applyFillReferences(panel, visible);
                return { ok: true, visible, summary };
            }
        });
        const attached = new WeakSet();
        const attachPanel = (panel) => {
            if (attached.has(panel))
                return;
            attached.add(panel);
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
                // Collapse the left file browser as soon as the notebook is ready so the
                // single-file exercise gets the full editor width. This is independent
                // of kernel/exercise-preparation timing, which may run much later.
                const shell = app.shell;
                shell.collapseLeft?.();
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
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (plugins);


/***/ }

}]);