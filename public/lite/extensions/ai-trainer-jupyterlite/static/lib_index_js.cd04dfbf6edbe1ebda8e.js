"use strict";
(self["webpackChunkai_trainer_jupyterlite"] = self["webpackChunkai_trainer_jupyterlite"] || []).push([["lib_index_js"],{

/***/ "./lib/csvViewer.js"
/*!**************************!*\
  !*** ./lib/csvViewer.js ***!
  \**************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
// 官方 @jupyterlab/csvviewer-extension 注册的两个查看器工厂。接住它们创建的窗口，
// 而不是自己再注册一套：这样「跳转到行」、文档搜索、分隔符工具栏、主题配色和标签页
// 布局恢复全部保持官方实现，本文件只负责把内容解码。
const CSV_FACTORIES = ["CSVTable", "TSVTable"];
const BASE64_ONLY = /^[A-Za-z0-9+/]+={0,2}$/;
function decodeBytes(bytes) {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
    catch {
        // 2.1.4 的 medical_data.csv 是全站唯一一份非 UTF-8 素材（GBK）。浏览器原生的
        // gb18030 解码器是 GBK 的超集，按它解就能正常显示中文列名。
        return new TextDecoder("gb18030").decode(bytes);
    }
}
/**
 * 把 drive 交过来的文件内容还原成给人看的文本。
 *
 * JupyterLite 的 drive 只能按扩展名决定传输格式，无法按请求决定（get() 完全忽略
 * options.format）。为了让 2.1.4 那份 GBK 数据集在读写两个方向都字节精确，站点把
 * .csv 登记成了 fileFormat="base64"（见 scripts/patch-jupyterlite-config.py），于是
 * 查看器请求 text 却拿到一整串 Base64，原样渲染出来就是一片乱码。
 *
 * 解码放在这里，传输层就不必为了显示而妥协。这个函数 Base64 和纯文本都吃，所以它
 * 不依赖 fileTypes 里那条配置究竟是哪一种——那条配置将来怎么改都不会把预览弄坏。
 */
function decodeStoredContent(value) {
    // Base64 串里不含逗号、制表符和换行，而任何真实的 CSV/TSV 一定含其中之一，
    // 所以这个判断不会把文本误判成 Base64。
    if (value.length < 8 || value.length % 4 !== 0 || !BASE64_ONLY.test(value))
        return value;
    let binary;
    try {
        binary = atob(value);
    }
    catch {
        return value;
    }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1)
        bytes[index] = binary.charCodeAt(index);
    const text = decodeBytes(bytes);
    // 兜底：解出来的东西若既没有换行也没有分隔符，说明原文本来就是文本，按原样用。
    return /[\n,\t;]/.test(text) ? text : value;
}
const patchedModels = new WeakSet();
/**
 * 给单个文档模型套上解码层。
 *
 * DocumentManager 是先同步创建窗口、再异步去取文件内容的（manager.ts 里
 * `context.initialize` 挂在 promise 上，`createWidget` 在其后同步执行），所以在
 * widgetCreated 里打上这一层，永远赶在内容灌进来之前——查看器一次都不会看到
 * Base64，也就没有先渲染乱码再刷新的闪烁。
 *
 * 只改入口（fromString）。出口（toString）不能动：CSVViewer 正是从 toString 取数据
 * 喂给 DataGrid 的，在那里还原成 Base64 会让表格重新变回乱码。代价是模型一旦被存
 * 回去，写下的是解码后的文本；但 CSV 查看器是只读的，模型不会变脏，自动保存只在
 * dirty 时触发（savehandler.ts），所以预览本身不会改动素材。
 */
function decodeModelContent(model) {
    if (patchedModels.has(model))
        return;
    patchedModels.add(model);
    const writeSource = model.fromString.bind(model);
    model.fromString = (value) => writeSource(decodeStoredContent(value));
    // 兜底：万一将来 DocumentManager 改成先填内容再建窗口，这里补解一次。
    const existing = model.toString();
    if (existing) {
        model.fromString(existing);
        model.dirty = false;
    }
}
function watchFactory(app, name) {
    const factory = app.docRegistry.getWidgetFactory(name);
    if (!factory)
        return false;
    factory.widgetCreated.connect((_sender, widget) => {
        decodeModelContent(widget.context.model);
    });
    return true;
}
const plugin = {
    id: "ai-trainer-jupyterlite:csv-viewer",
    autoStart: true,
    description: "Decodes CSV/TSV datasets that JupyterLite transfers as base64.",
    activate: (app) => {
        const pending = new Set(CSV_FACTORIES.filter(name => !watchFactory(app, name)));
        if (pending.size === 0)
            return;
        // 插件激活顺序没有保证，官方 CSV 插件可能还没注册工厂。剩下的等注册事件。
        app.docRegistry.changed.connect((_registry, args) => {
            if (args.type !== "widgetFactory" || args.change !== "added")
                return;
            for (const name of pending) {
                if (watchFactory(app, name))
                    pending.delete(name);
            }
        });
    }
};
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (plugin);


/***/ },

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
/* harmony import */ var _csvViewer__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./csvViewer */ "./lib/csvViewer.js");
/* harmony import */ var _onnxRuntime__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./onnxRuntime */ "./lib/onnxRuntime.js");
/* harmony import */ var _codemirror_view__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @codemirror/view */ "webpack/sharing/consume/default/@codemirror/view");
/* harmony import */ var _codemirror_view__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(_codemirror_view__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var _jupyterlab_notebook__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! @jupyterlab/notebook */ "webpack/sharing/consume/default/@jupyterlab/notebook");
/* harmony import */ var _jupyterlab_notebook__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(_jupyterlab_notebook__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var _jupyterlite_kernel__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! @jupyterlite/kernel */ "webpack/sharing/consume/default/@jupyterlite/kernel");
/* harmony import */ var _jupyterlite_kernel__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(_jupyterlite_kernel__WEBPACK_IMPORTED_MODULE_5__);






const PYODIDE_KERNEL_PLUGIN_ID = "@jupyterlite/pyodide-kernel-extension:kernel";
// 内核启动要在 Worker 里下载并初始化约 9MB 的 pyodide.asm.wasm、标准库和若干
// wheel。同一条网络上实测就绪耗时在 30 秒到 56.5 秒之间浮动，原先的 60 秒上限
// 只剩几秒余量，网络稍差就会误报“握手超时”，而内核其实仍在正常加载。
const KERNEL_BOOT_TIMEOUT_MS = 180000;
// 依赖准备阶段现在要把本题的科学计算 wheel 一并下完（2.1.3 是 42.6MB），慢网下轻易
// 超过原来的 180 秒。超时判早的代价是给一个仍在正常下载的环境报错，比等久了更糟，
// 何况前端有分阶段进度卡片和「重试准备」按钮兜着。
const ENVIRONMENT_TIMEOUT_MS = 600000;
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
class FillReferenceWidget extends _codemirror_view__WEBPACK_IMPORTED_MODULE_3__.WidgetType {
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
        return _codemirror_view__WEBPACK_IMPORTED_MODULE_3__.Decoration.widget({ widget: new FillReferenceWidget(item, comparisons), block: true, side: 1 }).range(line.to);
    });
    return _codemirror_view__WEBPACK_IMPORTED_MODULE_3__.Decoration.set(ranges, true);
}
const fillReferenceField = _codemirror_state__WEBPACK_IMPORTED_MODULE_0__.StateField.define({
    create: () => ({ visible: false, items: [], decorations: _codemirror_view__WEBPACK_IMPORTED_MODULE_3__.Decoration.none }),
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
            ? { visible, items, decorations: visible ? buildFillReferenceDecorations(transaction.newDoc, items) : _codemirror_view__WEBPACK_IMPORTED_MODULE_3__.Decoration.none }
            : value;
    },
    provide: field => _codemirror_view__WEBPACK_IMPORTED_MODULE_3__.EditorView.decorations.from(field, value => value.decorations)
});
const fillReferenceExtension = [
    fillReferenceField,
    _codemirror_view__WEBPACK_IMPORTED_MODULE_3__.EditorView.baseTheme({
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
    if (!panel && !path)
        panel = tracker.currentWidget;
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
// 官方参考答案是从考试用完整 notebook 逐字转录的，其中的 pandas 写法（例如
// df[col].fillna(method="ffill", inplace=True)）在新版 pandas 里会触发
// FutureWarning。答案必须与官方原文保持一致，不能为了消除告警而改写，因此在内核
// 里屏蔽这类版本迁移告警，避免考生把它误当成代码错误。
const WARNING_FILTERS = [
    "import warnings",
    "warnings.filterwarnings('ignore', category=FutureWarning)",
    "warnings.filterwarnings('ignore', category=DeprecationWarning)"
];
function kernelEnvironmentSource(packages, assets, preloadImports, fontAliases, onnxTaskCode) {
    const statements = [...WARNING_FILTERS];
    if (packages.length > 0) {
        // pyodide 自带的包（pandas、numpy、scikit-learn 等）在 import 时会自动加载，
        // 但 jupyterlite/pypi 里的纯 Python wheel（openpyxl、seaborn、
        // imbalanced-learn）不在 pyodide-lock 内，只能靠 piplite 装。
        statements.push("import piplite", `await piplite.install(${JSON.stringify(packages)})`);
    }
    if (preloadImports.length > 0) {
        // pyodide_kernel 在每个执行请求前都会跑 loadPackagesFromImports 扫描源码，所以
        // 这一行会把本题要用的 pandas / scikit-learn 等科学计算 wheel 就地下完。不写这
        // 一行也能跑——学员第一次 import 时同样会自动加载——但那时准备阶段早已结束、
        // 进度提示已经收起，2.1.3 的 42.6MB 会变成点「运行全部」后毫无反馈的一分钟。
        // 必须排在 piplite.install 之后：seaborn 之类不在 pyodide-lock 里，先 import 会
        // 直接 ModuleNotFoundError。
        statements.push(`import ${preloadImports.join(", ")}`);
    }
    if (assets.length > 0) {
        // 正常情况下素材由 mountDrive 挂进工作目录，下面的哈希校验直接命中、不发请求。
        // 但 mountDrive 在内核创建那一刻就定死了：跨域隔离若未成立（例如页面被从 http
        // 打开，或用的是修复前的缓存版本），就没有 /drive，学员会在自己的代码里撞上
        // FileNotFoundError。这里按清单补齐，让题目文件本身仍然不含任何环境代码。
        if (fontAliases.length > 0) {
            // 官方答案里写死了考场 Windows 机器的字体路径（2.1.4 用了
            // 'C:/Windows/Fonts/simhei.ttf'）。题目和答案是官方的，一个字都不能改，所以只能
            // 让这个路径在浏览器里也能解析。
            //
            // 不能把字体写到那个路径上：POSIX 下它是相对路径，会落到 /drive/<题号>/C:/…，
            // 而 DriveFS 支持建目录却不支持在其中建文件（实测 mkdir 成功、write_bytes 抛
            // FileNotFoundError）。所以改为把字体放进内存文件系统，再把 FontProperties 的
            // fname 按显式白名单改写过去——只改写清单里列出的那几个路径，其余一律原样传下去。
            statements.push("import hashlib as _fh", "from pathlib import Path as _FP", "from pyodide.http import pyfetch as _fpyfetch", `_fonts = ${JSON.stringify(fontAliases)}`, "_font_map = {}", "for _f in _fonts:", "    _fp = _FP('/lab-fonts') / _fh.sha256(_f['path'].encode()).hexdigest()[:12]", "    _fp.parent.mkdir(parents=True, exist_ok=True)", "    if not (_fp.exists() and _fh.sha256(_fp.read_bytes()).hexdigest() == _f['sha256']):", "        _fr = await _fpyfetch(_f['url'])", "        if _fr.status >= 400:", "            raise RuntimeError(f\"字体下载失败 HTTP {_fr.status}：{_f['url']}\")", "        _fb = await _fr.bytes()", "        if _fh.sha256(_fb).hexdigest() != _f['sha256']:", "            raise RuntimeError(f\"字体校验失败：{_f['url']}\")", "        _fp.write_bytes(_fb)", "    _font_map[_f['path']] = str(_fp)", "import matplotlib.font_manager as _fm", "_orig_fp_init = _fm.FontProperties.__init__", "def _aliased_fp_init(self, *_a, **_k):", "    _name = _k.get('fname')", "    if _name is not None and str(_name) in _font_map:", "        _k['fname'] = _font_map[str(_name)]", "    _orig_fp_init(self, *_a, **_k)", "_fm.FontProperties.__init__ = _aliased_fp_init", "del _fonts");
        }
        statements.push("import hashlib", "from pathlib import Path as _P", "from pyodide.http import pyfetch as _pyfetch", `_assets = ${JSON.stringify(assets)}`, "for _a in _assets:", "    _p = _P(_a['name'])", "    if _p.exists() and hashlib.sha256(_p.read_bytes()).hexdigest() == _a['sha256']:", "        continue", "    _r = await _pyfetch(_a['url'])", "    if _r.status >= 400:", "        raise RuntimeError(f\"素材下载失败 HTTP {_r.status}：{_a['url']}\")", "    _b = await _r.bytes()", "    if hashlib.sha256(_b).hexdigest() != _a['sha256']:", "        raise RuntimeError(f\"素材校验失败：{_a['name']}\")", "    _p.parent.mkdir(parents=True, exist_ok=True)", "    _p.write_bytes(_b)", "del _assets");
    }
    if (onnxTaskCode !== null) {
        // 垫片放在依赖与素材之后：它要 import numpy，也要素材已经就位。
        statements.push((0,_onnxRuntime__WEBPACK_IMPORTED_MODULE_2__.onnxRuntimeSource)(onnxTaskCode));
    }
    return statements.join("\n");
}
function taskMetadata(panel) {
    return panel.content.model?.getMetadata("ai_trainer") ?? {};
}
/** ONNX 题返回题号（垫片按题号参数化），非 ONNX 题返回 null。 */
function taskOnnxRuntime(panel) {
    const meta = panel.content.model?.getMetadata("ai_trainer");
    if (typeof meta?.onnx_runtime !== "string" || !meta.onnx_runtime)
        return null;
    return typeof meta.task_code === "string" ? meta.task_code : "";
}
function taskFontAliases(panel) {
    const aliases = taskMetadata(panel).font_aliases;
    if (!Array.isArray(aliases))
        return [];
    return aliases.filter((alias) => Boolean(alias) && typeof alias === "object"
        && typeof alias.path === "string"
        && typeof alias.url === "string"
        && typeof alias.sha256 === "string");
}
function taskPipPackages(panel) {
    const packages = taskMetadata(panel).pip_packages;
    return Array.isArray(packages) ? packages.filter((name) => typeof name === "string") : [];
}
function taskAssets(panel) {
    const assets = taskMetadata(panel).assets;
    if (!Array.isArray(assets))
        return [];
    return assets.filter((asset) => Boolean(asset) && typeof asset === "object"
        && typeof asset.name === "string"
        && typeof asset.url === "string"
        && typeof asset.sha256 === "string");
}
// 只预热确实能由 pyodide 提供的模块。题目源码里出现的其它 import（json、os 之类
// 标准库，或学员自己加的东西）混进预热行只会把准备阶段搞崩，所以走白名单而不是
// 直接把扫到的名字全塞进去。
const PRELOADABLE_IMPORTS = new Set([
    "pandas", "numpy", "matplotlib", "sklearn", "scipy", "PIL",
    "seaborn", "imblearn", "xgboost", "cv2", "openpyxl", "statsmodels"
]);
const IMPORT_PATTERN = /^[ \t]*(?:import|from)[ \t]+([A-Za-z_][A-Za-z0-9_]*)/gm;
// 预热清单直接从题目自己的单元推导，不依赖 notebook metadata：这样全屏模式、旧
// 草稿和任何未来新增的题目都自动生效，也不必为了改一份清单去重建 JupyterLite。
function taskPreloadImports(panel) {
    const found = new Set();
    for (const cell of panel.content.widgets) {
        const source = cell.model.sharedModel.getSource();
        for (const match of source.matchAll(IMPORT_PATTERN)) {
            if (PRELOADABLE_IMPORTS.has(match[1]))
                found.add(match[1]);
        }
    }
    return [...found].sort();
}
// 告警屏蔽、依赖安装与科学计算包预热走静默内核请求，而不是题目文件里的准备单元，
// 官方题目文件因此只剩考试本身的代码。素材无需下载：COOP/COEP 让 mountDrive 成立
// 后，随站发布的工作区文件本来就在内核的工作目录里。
async function applyKernelEnvironment(panel) {
    const kernel = panel.sessionContext.session?.kernel;
    if (!kernel)
        throw new Error("内核尚未就绪，无法准备题目环境");
    const code = kernelEnvironmentSource(taskPipPackages(panel), taskAssets(panel), taskPreloadImports(panel), taskFontAliases(panel), taskOnnxRuntime(panel));
    let lastFailure = "未知错误";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const reply = await kernel.requestExecute({
            code,
            silent: true,
            store_history: false,
            stop_on_error: true
        }).done;
        if (reply.content.status === "ok")
            return;
        lastFailure = reply.content.status === "error"
            ? `${reply.content.ename}：${reply.content.evalue}`
            : reply.content.status;
        if (attempt < 3)
            await new Promise(resolve => window.setTimeout(resolve, 800 * attempt));
    }
    throw new Error(`题目环境准备失败（已重试 3 次）：${lastFailure}`);
}
const plugin = {
    id: "ai-trainer-jupyterlite:bridge",
    autoStart: true,
    requires: [_jupyterlab_notebook__WEBPACK_IMPORTED_MODULE_4__.INotebookTracker, _jupyterlite_kernel__WEBPACK_IMPORTED_MODULE_5__.IKernelSpecs],
    description: "Connects JupyterLite notebooks with the preparation site's cloud draft service.",
    activate: (app, tracker, kernelSpecs) => {
        const kernelStarts = new WeakMap();
        const preparedGenerations = new WeakMap();
        const preparationRuns = new WeakMap();
        const pendingRepreparation = new WeakMap();
        const restartRuns = new WeakMap();
        const runtimeStates = new WeakMap();
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
        const cellsTagged = (panel, tag) => panel.content.widgets.filter(cell => {
            const tags = cell.model.getMetadata("tags");
            return Array.isArray(tags) && tags.includes(tag);
        });
        const exerciseIndexOf = (panel) => panel.content.widgets.findIndex(cell => {
            const tags = cell.model.getMetadata("tags");
            return Array.isArray(tags) && tags.includes("ai-trainer-exercise");
        });
        const runtimeState = (panel) => {
            const existing = runtimeStates.get(panel);
            if (existing)
                return existing;
            const kernel = panel.sessionContext.session?.kernel;
            const initial = {
                path: panel.context.path,
                phase: kernel ? "kernel_connected" : "not_started",
                generation: kernel ? 1 : 0,
                kernelId: kernel?.id ?? null,
                kernelStatus: kernel?.status ?? "unknown",
                connectionStatus: kernel?.connectionStatus ?? "disconnected",
                lastError: null,
                updatedAt: Date.now()
            };
            runtimeStates.set(panel, initial);
            return initial;
        };
        const publishRuntimeState = (panel, patch) => {
            const next = {
                ...runtimeState(panel),
                ...patch,
                path: panel.context.path,
                updatedAt: Date.now()
            };
            runtimeStates.set(panel, next);
            console.info("[ai-trainer-runtime]", next);
            notifyParent("AI_TRAINER_RUNTIME_STATE", next);
            return next;
        };
        const synchronizeKernel = (panel, phase) => {
            const previous = runtimeState(panel);
            const kernel = panel.sessionContext.session?.kernel;
            const identityChanged = Boolean(kernel?.id && kernel.id !== previous.kernelId);
            // A restart already creates the next generation before the worker changes.
            // Do not count the subsequent kernelChanged signal as another generation.
            const restartGenerationPending = pendingRepreparation.get(panel) === previous.generation;
            const nextPhase = phase ?? (identityChanged || ["not_started", "starting_kernel", "error"].includes(previous.phase)
                ? "kernel_connected"
                : previous.phase);
            return publishRuntimeState(panel, {
                phase: nextPhase,
                generation: previous.generation + (identityChanged && !restartGenerationPending ? 1 : 0),
                kernelId: kernel?.id ?? null,
                kernelStatus: kernel?.status ?? "unknown",
                connectionStatus: kernel?.connectionStatus ?? "disconnected",
                lastError: null
            });
        };
        const beginRestartGeneration = (panel, status = "restarting") => {
            const previous = runtimeState(panel);
            const generation = previous.generation + 1;
            preparedGenerations.delete(panel);
            pendingRepreparation.set(panel, generation);
            return publishRuntimeState(panel, {
                phase: "starting_kernel",
                generation,
                kernelId: panel.sessionContext.session?.kernel?.id ?? previous.kernelId,
                kernelStatus: status,
                connectionStatus: panel.sessionContext.session?.kernel?.connectionStatus ?? previous.connectionStatus,
                lastError: null
            });
        };
        const assertCurrentGeneration = (panel, generation, kernelId) => {
            const current = runtimeState(panel);
            const activeKernelId = panel.sessionContext.session?.kernel?.id;
            if (current.generation !== generation || activeKernelId !== kernelId) {
                throw new Error(`内核已更替，丢弃第 ${generation} 代环境准备结果`);
            }
        };
        const waitForKernelUsable = async (panel, generation, kernelId, timeoutMs = 15000) => {
            const deadline = Date.now() + timeoutMs;
            let lastStatus = "unknown";
            let lastConnection = "disconnected";
            while (Date.now() < deadline) {
                assertCurrentGeneration(panel, generation, kernelId);
                const kernel = panel.sessionContext.session?.kernel;
                lastStatus = kernel?.status ?? "missing";
                lastConnection = kernel?.connectionStatus ?? "disconnected";
                if (lastStatus === "dead")
                    throw new Error("Python 内核在环境准备后停止");
                if (lastStatus === "idle" && lastConnection === "connected")
                    return;
                await new Promise(resolve => window.setTimeout(resolve, 50));
            }
            throw new Error(`环境准备完成但内核未恢复可用状态（status=${lastStatus}, connection=${lastConnection}）`);
        };
        // 依赖安装、告警屏蔽、素材恢复和 ONNX 运行时全都活在内核进程里，所以这一段既要
        // 在首次进入时跑，也要在每次内核重启后重跑——见下面 statusChanged 里的处理。
        const prepareEnvironment = async (panel) => {
            const kernel = panel.sessionContext.session?.kernel;
            if (!kernel)
                throw new Error("内核尚未连接，无法准备题目环境");
            const observed = runtimeState(panel);
            const state = observed.kernelId === kernel.id ? observed : synchronizeKernel(panel);
            const generation = state.generation;
            const kernelId = kernel.id;
            if (preparedGenerations.get(panel) === generation && state.phase === "ready")
                return;
            let run = preparationRuns.get(panel);
            if (!run || run.generation !== generation) {
                // 只有 5 道 ONNX 题带运行时单元，其余题目文件里全是习题代码。
                const runtimeCells = cellsTagged(panel, "ai-trainer-onnx");
                const promise = (async () => {
                    publishRuntimeState(panel, { phase: "preparing_environment", lastError: null });
                    notifyParent("AI_TRAINER_EXERCISE_PREPARING", { path: panel.context.path });
                    notifyParent("AI_TRAINER_EXERCISE_STAGE", { path: panel.context.path, stage: "packages" });
                    await withTimeout(applyKernelEnvironment(panel), "题目依赖准备", ENVIRONMENT_TIMEOUT_MS);
                    assertCurrentGeneration(panel, generation, kernelId);
                    if (runtimeCells.length === 0) {
                        // execute_reply can arrive just before the kernel's final idle
                        // status message. Publishing ready in that gap lets a follow-up
                        // request race the worker and occasionally disappear on slow CI.
                        await waitForKernelUsable(panel, generation, kernelId);
                        preparedGenerations.set(panel, generation);
                        publishRuntimeState(panel, { phase: "ready", lastError: null });
                        return;
                    }
                    notifyParent("AI_TRAINER_EXERCISE_STAGE", { path: panel.context.path, stage: "runtime" });
                    let lastFailure = null;
                    for (let attempt = 1; attempt <= 2; attempt += 1) {
                        const succeeded = await withTimeout(_jupyterlab_notebook__WEBPACK_IMPORTED_MODULE_4__.NotebookActions.runCells(panel.content, runtimeCells, panel.sessionContext), "浏览器运行时准备", 180000);
                        assertCurrentGeneration(panel, generation, kernelId);
                        if (succeeded) {
                            await waitForKernelUsable(panel, generation, kernelId);
                            preparedGenerations.set(panel, generation);
                            publishRuntimeState(panel, { phase: "ready", lastError: null });
                            return;
                        }
                        lastFailure = preparationFailure(runtimeCells);
                        if (attempt < 2)
                            await new Promise(resolve => window.setTimeout(resolve, 1200));
                    }
                    throw new Error(lastFailure ?? "环境准备单元未能成功执行");
                })();
                run = { generation, promise };
                preparationRuns.set(panel, run);
            }
            try {
                await run.promise;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (runtimeState(panel).generation === generation) {
                    publishRuntimeState(panel, { phase: "error", lastError: message });
                    notifyParent("AI_TRAINER_EXERCISE_ERROR", { path: panel.context.path, message });
                }
                throw error;
            }
            finally {
                if (preparationRuns.get(panel) === run)
                    preparationRuns.delete(panel);
            }
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
                const infrastructure = Array.isArray(tags) && tags.includes("ai-trainer-onnx");
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
                try {
                    app.shell.activateById(panel.id);
                    await withTimeout(panel.context.ready, "Notebook 准备", 15000);
                    // SessionContext.initialize() is the one authoritative owner of the
                    // metadata-selected cold start. Waiting for it here serializes our
                    // fallback changeKernel() behind JupyterLab instead of guessing with a
                    // fixed grace period and occasionally creating two Pyodide workers.
                    publishRuntimeState(panel, { phase: "starting_kernel", lastError: null });
                    await withTimeout(panel.sessionContext.initialize(), "内核会话初始化", KERNEL_BOOT_TIMEOUT_MS);
                    const existing = panel.sessionContext.session?.kernel;
                    if (existing) {
                        if (existing.status === "dead")
                            throw new Error("Python 内核已停止，请重新加载环境");
                        await withTimeout(existing.info, "Python 内核握手", KERNEL_BOOT_TIMEOUT_MS);
                        synchronizeKernel(panel);
                        return { status: existing.status, name: existing.name };
                    }
                    const inFlight = kernelStarts.get(panel);
                    if (inFlight)
                        return await inFlight;
                    const start = (async () => {
                        const preferred = await preferredKernel();
                        notifyParent("AI_TRAINER_KERNEL_STATUS", { path: panel.context.path, status: "starting" });
                        const kernel = await withTimeout(panel.sessionContext.changeKernel({ name: preferred }), "Python 内核启动", KERNEL_BOOT_TIMEOUT_MS);
                        if (!kernel)
                            throw new Error("Python 内核启动后未返回连接");
                        const activeKernel = panel.sessionContext.session?.kernel ?? kernel;
                        await withTimeout(activeKernel.info, "Python 内核握手", KERNEL_BOOT_TIMEOUT_MS);
                        const status = activeKernel.status ?? "starting";
                        synchronizeKernel(panel);
                        notifyParent("AI_TRAINER_KERNEL_STATUS", { path: panel.context.path, status });
                        return { status, name: activeKernel.name || preferred };
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
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    pendingRepreparation.delete(panel);
                    publishRuntimeState(panel, { phase: "error", lastError: message });
                    notifyParent("AI_TRAINER_KERNEL_ERROR", {
                        path: panel.context.path,
                        message
                    });
                    throw error;
                }
            }
        });
        app.commands.addCommand("ai-trainer:get-runtime-state", {
            label: "读取题目运行环境状态",
            execute: args => {
                const panel = activePanel(tracker, targetPath(args));
                return { ...runtimeState(panel) };
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
                const exerciseIndex = exerciseIndexOf(panel);
                await prepareEnvironment(panel);
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
        app.commands.addCommand("ai-trainer:restart-and-prepare", {
            label: "重启 Python 内核并重新准备题目环境",
            execute: async (args) => {
                const panel = activePanel(tracker, targetPath(args));
                const active = restartRuns.get(panel);
                if (active)
                    return active;
                const restart = (async () => {
                    try {
                        await app.commands.execute("ai-trainer:ensure-kernel", { path: panel.context.path });
                        if (!pendingRepreparation.has(panel))
                            beginRestartGeneration(panel);
                        await withTimeout(panel.sessionContext.restartKernel(), "Python 内核重启", KERNEL_BOOT_TIMEOUT_MS);
                        synchronizeKernel(panel, "kernel_connected");
                        await prepareEnvironment(panel);
                        pendingRepreparation.delete(panel);
                        const state = runtimeState(panel);
                        notifyParent("AI_TRAINER_EXERCISE_READY", {
                            path: panel.context.path,
                            exerciseIndex: exerciseIndexOf(panel),
                            generation: state.generation
                        });
                        return { ...state };
                    }
                    catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        pendingRepreparation.delete(panel);
                        publishRuntimeState(panel, { phase: "error", lastError: message });
                        notifyParent("AI_TRAINER_EXERCISE_ERROR", { path: panel.context.path, message });
                        throw error;
                    }
                })();
                restartRuns.set(panel, restart);
                try {
                    return await restart;
                }
                finally {
                    if (restartRuns.get(panel) === restart)
                        restartRuns.delete(panel);
                }
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
                    kernel: panel.sessionContext.session?.kernel?.status ?? "unknown",
                    runtime: { ...runtimeState(panel) }
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
                // 准备阶段装的东西全在内核进程里：piplite 的纯 Python wheel（2.1.2、2.1.3、
                // 2.2.1、2.2.4）、FutureWarning 屏蔽、预热 import、ONNX 运行时。重启内核会把
                // 它们一并带走，而准备状态记在面板上，重启后不会自动重跑——实测重启后
                // openpyxl 变成 ModuleNotFoundError、告警屏蔽失效，官方答案直接跑不动。
                // 这里进入新一代状态，等内核回到 idle 再补一次准备。
                if (status === "restarting" || status === "autorestarting") {
                    if (!pendingRepreparation.has(panel))
                        beginRestartGeneration(panel, status);
                    else
                        publishRuntimeState(panel, { phase: "starting_kernel", kernelStatus: status });
                    return;
                }
                publishRuntimeState(panel, {
                    kernelStatus: status,
                    connectionStatus: panel.sessionContext.session?.kernel?.connectionStatus ?? "disconnected"
                });
                if (status === "idle" && pendingRepreparation.has(panel)) {
                    void prepareEnvironment(panel)
                        .then(() => {
                        pendingRepreparation.delete(panel);
                        notifyParent("AI_TRAINER_EXERCISE_READY", {
                            path: panel.context.path,
                            exerciseIndex: exerciseIndexOf(panel),
                            generation: runtimeState(panel).generation
                        });
                    })
                        .catch(() => undefined);
                }
            });
            panel.sessionContext.kernelChanged.connect(() => {
                synchronizeKernel(panel, "kernel_connected");
            });
            panel.sessionContext.connectionStatusChanged.connect((_context, status) => {
                publishRuntimeState(panel, { connectionStatus: status });
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
const plugins = [plugin, _csvViewer__WEBPACK_IMPORTED_MODULE_1__["default"]];
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (plugins);


/***/ },

/***/ "./lib/onnxRuntime.js"
/*!****************************!*\
  !*** ./lib/onnxRuntime.js ***!
  \****************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ONNX_RUNTIME_TEMPLATE: () => (/* binding */ ONNX_RUNTIME_TEMPLATE),
/* harmony export */   onnxRuntimeSource: () => (/* binding */ onnxRuntimeSource)
/* harmony export */ });
// JupyterLite 浏览器 ONNX Runtime 垫片。
//
// 这段 Python 原先是生成到 notebook 第 0 格里的：9026 字、只读，压在官方考题代码
// 上面——3.2.2 的考题正文才 705 字，垫片是它的 13 倍，学员打开题目先看到的是环境
// 代码。而进入实操题本来就有「下载依赖与素材」和「下载 ONNX 模型」两个准备阶段，
// 运行时垫片属于那里。
//
// 它做的事是往 sys.modules 塞一个兼容原考试 onnxruntime API 的假模块，底层走
// onnxruntime-web。准备阶段与题目代码共用同一个内核命名空间，且早于任何单元格执行，
// 所以官方代码的 `import onnxruntime as ort` 照样命中，行为等价。
//
// 含顶层 await，只能由内核按支持顶层 await 的方式执行——这正是准备阶段的执行方式
// （piplite 安装同样是 `await`），exec() 做不到。
const ONNX_RUNTIME_TEMPLATE = `# JupyterLite 浏览器 ONNX Runtime：兼容原考试 onnxruntime API，底层使用 onnxruntime-web
import sys
import types
from types import SimpleNamespace

import numpy as _np
from js import Object
from pyodide.code import run_js
from pyodide.ffi import can_run_sync, run_sync, to_js

_browser_ort_bridge = run_js(r"""
(() => {
  const origin = self.location.origin;
  const sessions = new Map();
  let manifestPromise;
  let runtimePromise;

  const digest = async buffer => {
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join("");
  };

  const loadManifest = async () => {
    manifestPromise ??= fetch(\`\${origin}/labs/manifest.json\`).then(response => {
      if (!response.ok) throw new Error("模型清单加载失败");
      return response.json();
    });
    return manifestPromise;
  };

  const loadRuntime = async () => {
    if (!runtimePromise) {
      const runtimeBase = \`\${origin}/labs/runtime/onnxruntime-web/1.27.0/\`;
      runtimePromise = import(\`\${runtimeBase}ort.wasm.bundle.min.js\`).then(ort => {
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.wasmPaths = runtimeBase;
        return ort;
      });
    }
    return runtimePromise;
  };

  const loadModelBytes = async model => {
    const cache = await caches.open("ai-trainer-onnx-v2");
    const cacheKey = new Request(\`\${origin}/labs/model-cache/\${model.modelId}.onnx\`);
    const cached = await cache.match(cacheKey);
    if (cached) {
      const cachedBuffer = await cached.arrayBuffer();
      if (await digest(cachedBuffer) === model.sha256) return new Uint8Array(cachedBuffer);
    }

    const chunks = [];
    let total = 0;
    for (const part of model.chunks) {
      const response = await fetch(\`\${origin}\${part.url}\`);
      if (!response.ok) throw new Error(\`模型分片加载失败：\${part.url}\`);
      const buffer = await response.arrayBuffer();
      if (await digest(buffer) !== part.sha256) throw new Error(\`模型分片校验失败：\${part.url}\`);
      const bytes = new Uint8Array(buffer);
      chunks.push(bytes);
      total += bytes.byteLength;
    }

    const modelBytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      modelBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (await digest(modelBytes.buffer) !== model.sha256) throw new Error("模型完整性校验失败");
    await cache.put(cacheKey, new Response(modelBytes, { headers: { "content-type": "application/octet-stream" } }));
    return modelBytes;
  };

  const metadata = (names, items) => names.map((name, index) => {
    const item = items[index];
    return {
      name,
      type: String(item?.type ?? "float32"),
      shape: [...(item?.shape ?? [])],
    };
  });

  const describe = record => ({
    id: record.id,
    model: record.model.name,
    runtime: record.model.browserRuntime,
    variant: record.model.sourceVariant,
    inputs: metadata(record.session.inputNames, record.session.inputMetadata),
    outputs: metadata(record.session.outputNames, record.session.outputMetadata),
  });

  const create = async taskCode => {
    const existing = sessions.get(taskCode);
    if (existing) return describe(existing);
    const manifest = await loadManifest();
    const model = manifest.tasks?.[taskCode]?.model;
    if (!model) throw new Error(\`任务 \${taskCode} 没有浏览器模型\`);
    const [ort, modelBytes] = await Promise.all([loadRuntime(), loadModelBytes(model)]);
    const session = await ort.InferenceSession.create(modelBytes, { executionProviders: ["wasm"] });
    const record = { id: taskCode, model, ort, session };
    sessions.set(taskCode, record);
    return describe(record);
  };

  const typedData = (type, values) => {
    const data = Array.from(values);
    if (type === "float64") return new Float64Array(data);
    if (type === "int8") return new Int8Array(data);
    if (type === "uint8" || type === "bool") return new Uint8Array(data);
    if (type === "int16") return new Int16Array(data);
    if (type === "uint16") return new Uint16Array(data);
    if (type === "int32") return new Int32Array(data);
    if (type === "uint32") return new Uint32Array(data);
    if (type === "int64") return BigInt64Array.from(data, value => BigInt(value));
    if (type === "uint64") return BigUint64Array.from(data, value => BigInt(value));
    return new Float32Array(data);
  };

  const serializeTensor = (name, tensor) => ({
    name,
    type: tensor.type,
    dims: [...tensor.dims],
    data: Array.from(tensor.data, value => typeof value === "bigint" ? value.toString() : value),
  });

  const run = async (sessionId, inputItems, requestedOutputs) => {
    const record = sessions.get(sessionId);
    if (!record) throw new Error("ONNX 会话不存在，请重新加载实验环境");
    const feeds = {};
    for (const item of Array.from(inputItems)) {
      feeds[item.name] = new record.ort.Tensor(
        item.type,
        typedData(item.type, item.data),
        Array.from(item.dims, Number),
      );
    }
    const outputMap = await record.session.run(feeds);
    const names = requestedOutputs?.length ? Array.from(requestedOutputs) : record.session.outputNames;
    return names.map(name => serializeTensor(name, outputMap[name]));
  };

  const smoke = async taskCode => {
    const info = await create(taskCode);
    const record = sessions.get(taskCode);
    const feeds = {};
    const inputs = [];
    for (const item of info.inputs) {
      const shape = (item.shape.length ? item.shape : [1]).map(value => Number.isInteger(value) && value > 0 ? value : 1);
      const size = shape.reduce((left, right) => left * right, 1);
      feeds[item.name] = new record.ort.Tensor(item.type, typedData(item.type, new Array(size).fill(0)), shape);
      inputs.push({ name: item.name, type: item.type, shape });
    }
    const outputMap = await record.session.run(feeds);
    const outputs = record.session.outputNames.map(name => {
      const tensor = outputMap[name];
      return { name, type: tensor.type, shape: [...tensor.dims] };
    });
    return { model: info.model, runtime: info.runtime, variant: info.variant, inputs, outputs };
  };

  return { create, run, smoke };
})()
""")


def _browser_value(value):
    return value.to_py() if hasattr(value, "to_py") else value


def _numpy_dtype(onnx_type):
    return {
        "float32": _np.float32,
        "float64": _np.float64,
        "int8": _np.int8,
        "uint8": _np.uint8,
        "bool": _np.bool_,
        "int16": _np.int16,
        "uint16": _np.uint16,
        "int32": _np.int32,
        "uint32": _np.uint32,
        "int64": _np.int64,
        "uint64": _np.uint64,
    }.get(onnx_type, _np.float32)


class InferenceSession:
    """浏览器版 onnxruntime.InferenceSession 兼容层。"""

    def __init__(self, model_path, providers=None, **_options):
        if not can_run_sync():
            raise RuntimeError("当前浏览器不支持同步 ONNX 桥接，请升级到最新版 Chromium 浏览器")
        info = _browser_value(run_sync(_browser_ort_bridge.create("__TASK_CODE__")))
        self._session_id = info["id"]
        self._model_path = str(model_path)
        self._providers = list(providers or ["WasmExecutionProvider"])
        self._inputs = [SimpleNamespace(**item) for item in info["inputs"]]
        self._outputs = [SimpleNamespace(**item) for item in info["outputs"]]

    def get_inputs(self):
        return self._inputs

    def get_outputs(self):
        return self._outputs

    def get_providers(self):
        return self._providers

    def run(self, output_names, input_feed, run_options=None):
        del run_options
        inputs = []
        for name, value in input_feed.items():
            array = _np.ascontiguousarray(value)
            onnx_type = {
                "f": "float32" if array.dtype.itemsize <= 4 else "float64",
                "i": f"int{array.dtype.itemsize * 8}",
                "u": f"uint{array.dtype.itemsize * 8}",
                "b": "bool",
            }.get(array.dtype.kind, "float32")
            inputs.append({
                "name": str(name),
                "type": onnx_type,
                "dims": list(array.shape),
                "data": array.reshape(-1).tolist(),
            })
        requested = [] if output_names is None else list(output_names)
        result = run_sync(_browser_ort_bridge.run(
            self._session_id,
            to_js(inputs, dict_converter=Object.fromEntries),
            to_js(requested),
        ))
        outputs = _browser_value(result)
        return [
            _np.asarray(item["data"], dtype=_numpy_dtype(item["type"])).reshape(tuple(item["dims"]))
            for item in outputs
        ]


_onnxruntime = types.ModuleType("onnxruntime")
_onnxruntime.InferenceSession = InferenceSession
_onnxruntime.__version__ = "1.27.0-web"
sys.modules["onnxruntime"] = _onnxruntime


async def browser_onnx_check(task_code="__TASK_CODE__"):
    """执行一次真实的浏览器 WASM 推理，并返回张量结构。"""
    result = await _browser_ort_bridge.smoke(task_code)
    return _browser_value(result)


onnx_result = await browser_onnx_check()
onnx_result
`;
/** 垫片按题号参数化：把 __TASK_CODE__ 换成当前题号。 */
function onnxRuntimeSource(taskCode) {
    return ONNX_RUNTIME_TEMPLATE.split("__TASK_CODE__").join(taskCode);
}


/***/ }

}]);