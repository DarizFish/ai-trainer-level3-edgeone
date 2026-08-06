import type { DocumentRegistry, IDocumentWidget } from "@jupyterlab/docregistry";
import type { JupyterFrontEnd, JupyterFrontEndPlugin } from "@jupyterlab/application";

// 官方 @jupyterlab/csvviewer-extension 注册的两个查看器工厂。接住它们创建的窗口，
// 而不是自己再注册一套：这样「跳转到行」、文档搜索、分隔符工具栏、主题配色和标签页
// 布局恢复全部保持官方实现，本文件只负责把内容解码。
const CSV_FACTORIES = ["CSVTable", "TSVTable"];

const BASE64_ONLY = /^[A-Za-z0-9+/]+={0,2}$/;

function decodeBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
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
function decodeStoredContent(value: string): string {
  // Base64 串里不含逗号、制表符和换行，而任何真实的 CSV/TSV 一定含其中之一，
  // 所以这个判断不会把文本误判成 Base64。
  if (value.length < 8 || value.length % 4 !== 0 || !BASE64_ONLY.test(value)) return value;
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    return value;
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const text = decodeBytes(bytes);
  // 兜底：解出来的东西若既没有换行也没有分隔符，说明原文本来就是文本，按原样用。
  return /[\n,\t;]/.test(text) ? text : value;
}

const patchedModels = new WeakSet<DocumentRegistry.IModel>();

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
function decodeModelContent(model: DocumentRegistry.IModel): void {
  if (patchedModels.has(model)) return;
  patchedModels.add(model);

  const writeSource = model.fromString.bind(model);
  model.fromString = (value: string) => writeSource(decodeStoredContent(value));

  // 兜底：万一将来 DocumentManager 改成先填内容再建窗口，这里补解一次。
  const existing = model.toString();
  if (existing) {
    model.fromString(existing);
    model.dirty = false;
  }
}

function watchFactory(app: JupyterFrontEnd, name: string): boolean {
  const factory = app.docRegistry.getWidgetFactory(name);
  if (!factory) return false;
  factory.widgetCreated.connect((_sender, widget: IDocumentWidget) => {
    decodeModelContent(widget.context.model);
  });
  return true;
}

const plugin: JupyterFrontEndPlugin<void> = {
  id: "ai-trainer-jupyterlite:csv-viewer",
  autoStart: true,
  description: "Decodes CSV/TSV datasets that JupyterLite transfers as base64.",
  activate: (app: JupyterFrontEnd) => {
    const pending = new Set(CSV_FACTORIES.filter(name => !watchFactory(app, name)));
    if (pending.size === 0) return;
    // 插件激活顺序没有保证，官方 CSV 插件可能还没注册工厂。剩下的等注册事件。
    app.docRegistry.changed.connect((_registry, args) => {
      if (args.type !== "widgetFactory" || args.change !== "added") return;
      for (const name of pending) {
        if (watchFactory(app, name)) pending.delete(name);
      }
    });
  }
};

export default plugin;
