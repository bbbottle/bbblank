/**
 * Playground 面板：与 Chrome Sources 相同的三栏布局。
 * - 左栏：草稿导航（apps/blog/src/plugins/<name>/）；
 * - 中栏：可关闭的文件标签（两端为显示 / 隐藏左右栏的按钮）、可编辑的源码编辑器、状态栏；
 * - 右栏：操作工具栏（运行 / 停止 / 新建插件 / 新建文件 / 删除文件）与可折叠窗格（插件状态、问题）。
 */
import type { Cleanup, StorageFacade } from "@bbblank/sdk";
import type { PluginManagerFacade } from "@bbblank/host-dom";
import {
  describeError,
  expandableSection,
  h,
  icon,
  replace,
  splitWidget,
  statusDot,
  tabOverflow,
  toolbarButton,
  toolbarSeparator,
  treeOutline,
} from "@bbblank/devtools-ui";
import type { Child, IconName, PanelView, TreeNode } from "@bbblank/devtools-ui";
import type { Cursor, createCodeEditor } from "@bbblank/devtools-ui/editor";
import { LinkError } from "./linker";
import type { Compiler, CompletionEntry } from "./compiler";
import type { DevtoolsDeveloperService } from "../devtools/api";
import { devIdOf } from "./runner";
import type { Problem, Runner } from "./runner";
import { NAME_PATTERN, loadWorkspace, pluginDir, pluginNames, pluginOf, saveWorkspace, template } from "./workspace";
import type { Files } from "./workspace";

const fileIcon = (name: string): Child => {
  const ext = name.slice(name.lastIndexOf(".") + 1);
  const [kind, glyph]: [string, IconName] = ["ts", "tsx"].includes(ext)
    ? ["script", "file-script"]
    : ["default", "document"];
  return icon(glyph, `file-icon ${kind}`);
};

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** 偏移量 → 1 起的行列号 */
const lineCol = (text: string, offset: number) => {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length, column: before.at(-1)!.length + 1 };
};

/** TypeScript ScriptElementKind → CodeMirror 补全类型（决定补全列表中的图标） */
const completionType = (kind: string) =>
  ({
    function: "function",
    "local function": "function",
    method: "method",
    property: "property",
    getter: "property",
    setter: "property",
    var: "variable",
    let: "variable",
    const: "constant",
    "local var": "variable",
    parameter: "variable",
    class: "class",
    "local class": "class",
    interface: "interface",
    type: "type",
    enum: "enum",
    "enum member": "enum",
    module: "namespace",
    alias: "variable",
    keyword: "keyword",
  })[kind];

export const playgroundPanel = (deps: {
  readonly storage: StorageFacade;
  readonly pm: PluginManagerFacade;
  readonly runner: Runner;
  readonly compiler: Compiler;
  readonly developer: DevtoolsDeveloperService;
}): PanelView & { init(): Promise<void>; dispose(): void } => {
  const { storage, pm, runner, compiler, developer } = deps;
  let files: Files = {};
  const open: Array<string> = [];
  let active: string | undefined;
  let cursor: Cursor = { line: 1, column: 1, selected: 0 };
  let loaded = false;
  let busy = false;
  let problems: ReadonlyArray<Problem> = [];
  let error: string | undefined;
  let lastRun: string | undefined;
  /** 草稿是否已安装为开发插件（dev-<草稿名>）：以内核为准，可能经 Plugins 面板安装或卸载 */
  const installed = (name: string) => pm.list().find((p) => p.id === devIdOf(name));
  /** 已登记到 Plugins 面板的草稿：草稿名 → 撤销登记 */
  const entries = new Map<string, Cleanup>();

  // ---------- 保存 ----------
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void saveWorkspace(storage, files), 400);
  };

  // ---------- 布局 ----------
  const tree = treeOutline();
  tree.defaultCollapsed = true;
  tree.toggleOnClick = true;
  tree.onPick = (path) => void show(path);

  const tabs = h("div", { class: "tabbed-pane-header-tabs", role: "tablist" });
  // 窄屏放不下的文件标签收进「>>」，点击弹出系统菜单
  const overflow = tabOverflow(tabs, (path) => void show(path));
  const message = h("div", { class: "empty" });
  const editorEl = h("div", { class: "editor-view", hidden: true });
  const editorHost = h("div", { class: "editor-host" }, message, editorEl);
  const position = h("span", {});
  const lastRunEl = h("span", {});

  // 左栏：导航（对应 Sources 的 Page / Workspace 导航）
  const navigator = h(
    "div",
    { class: "sources-navigator" },
    h("div", { class: "tabbed-pane-header" }, h("div", { class: "tabbed-pane-header-tabs" }, h("div", { class: "tabbed-pane-header-tab selected" }, "草稿"))),
    tree,
  );

  // 右栏：操作工具栏 + 可折叠窗格（对应 Sources 的调试工具栏与 Watch / Breakpoints 等窗格）
  const actions = h("div", { class: "toolbar" });
  const pluginBody = h("div", { class: "section-body playground-plugin" });
  const problemsBody = h("div", { class: "playground-problems" });
  const problemsCount = h("span", { class: "count" });
  const sidebar = h(
    "div",
    { class: "playground-sidebar" },
    actions,
    expandableSection("插件", pluginBody),
    expandableSection(["问题", problemsCount], problemsBody),
  );

  const outer = splitWidget();
  outer.sidebarSide = "left";
  outer.sidebarWidth = 220;
  const inner = splitWidget();
  inner.sidebarSide = "right";
  inner.sidebarWidth = 280;

  /** 用户手动切换过侧栏后，不再按面板宽度自动收起 / 展开 */
  let userToggled = false;
  const syncToggle = (b: HTMLButtonElement, split: typeof outer, side: "left" | "right") => {
    const shown = split.sidebarShown;
    replace(b, icon(`${side}-panel-${shown ? "close" : "open"}`));
    b.title = b.ariaLabel = `${shown ? "隐藏" : "显示"}${side === "left" ? "导航栏" : "操作栏"}`;
  };
  const toggle = (split: typeof outer, side: "left" | "right") => {
    const b: HTMLButtonElement = toolbarButton(side === "left" ? "left-panel-close" : "right-panel-close", "", () => {
      userToggled = true;
      split.sidebarShown = !split.sidebarShown;
      syncToggle(b, split, side);
    });
    b.classList.add("tabbed-pane-side-button");
    syncToggle(b, split, side);
    return b;
  };
  const leftToggle = toggle(outer, "left");
  const rightToggle = toggle(inner, "right");

  outer.sidebar.append(navigator);
  inner.sidebar.append(sidebar);
  inner.main.append(
    h(
      "div",
      { class: "sources-editor" },
      h("div", { class: "tabbed-pane-header" }, leftToggle, tabs, overflow.el, rightToggle),
      editorHost,
      h("div", { class: "status-bar" }, position, lastRunEl),
    ),
  );
  outer.main.append(inner);
  const el = h("div", { class: "panel" }, outer);

  /** 窄屏（如手机）放不下三栏：面板宽度小于 640 px 时收起左右两栏，由标签栏两端的按钮按需展开 */
  const NARROW = 640;
  new ResizeObserver(() => {
    if (userToggled || !el.clientWidth) return;
    const wide = el.clientWidth >= NARROW;
    if (outer.sidebarShown === wide && inner.sidebarShown === wide) return;
    outer.sidebarShown = inner.sidebarShown = wide;
    syncToggle(leftToggle, outer, "left");
    syncToggle(rightToggle, inner, "right");
  }).observe(el);

  let editor: Promise<ReturnType<typeof createCodeEditor>> | undefined;
  const activePlugin = () => (active ? pluginOf(active) : pluginNames(files)[0]);

  // ---------- 渲染 ----------
  const renderActions = () => {
    const name = activePlugin();
    const id = name && installed(name) ? devIdOf(name) : undefined;
    // 草稿读取完成前禁用全部操作
    const blocked = busy || !loaded;
    const button = (glyph: IconName, title: string, onclick: () => void, disabled: boolean) => {
      const b = toolbarButton(glyph, title, onclick);
      b.disabled = disabled;
      return b;
    };
    replace(
      actions,
      button("resume", name ? `运行 ${name}（编译最新草稿并重新安装）` : "运行", () => void run(), blocked || !name),
      button("stop", "停止（卸载开发插件）", () => void stop(), blocked || !id),
      toolbarSeparator(),
      button("plus", "新建插件", () => void createPlugin(), blocked),
      button("file-script", "新建文件", () => createFile(), blocked || !name),
      button("bin", "删除当前文件", () => deleteFile(), blocked || !active),
    );
  };

  const renderTree = () => {
    if (!loaded) return replace(tree, h("div", { class: "empty" }, "正在读取草稿…"));
    const names = pluginNames(files);
    // 与 Overrides 导航的「+ Select folder for overrides」相同：空状态下给出新建入口
    if (!names.length)
      return replace(
        tree,
        h("button", { class: "navigator-add", onclick: () => void createPlugin() }, icon("plus"), "新建插件"),
      );
    const nodes: ReadonlyArray<TreeNode> = names.map((name) => ({
      key: name,
      label: [icon("folder", "file-icon folder"), name, installed(name) ? h("span", { class: "chip" }, installed(name)!.status) : null],
      children: Object.keys(files)
        .filter((p) => p.startsWith(pluginDir(name)))
        .sort()
        .map((p) => ({ key: p, label: [fileIcon(p), p.slice(pluginDir(name).length)], children: [] })),
    }));
    tree.update(nodes, active);
  };

  const renderTabs = () => {
    renderTabStrip();
    overflow.update();
  };
  const renderTabStrip = () =>
    replace(
      tabs,
      open.map((path) =>
        h(
          "div",
          {
            class: `tabbed-pane-header-tab closeable${path === active ? " selected" : ""}`,
            role: "tab",
            title: path,
            "aria-selected": String(path === active),
            "data-key": path,
            "data-title": path.slice(path.lastIndexOf("/") + 1),
            onclick: () => void show(path),
          },
          h("span", { class: "tabbed-pane-header-tab-icon" }, fileIcon(path)),
          h("span", { class: "tabbed-pane-header-tab-title" }, baseName(path)),
          h(
            "span",
            {
              class: "tabbed-pane-close-button",
              title: "关闭",
              onclick: (e: Event) => {
                e.stopPropagation();
                close(path);
              },
            },
            icon("cross"),
          ),
        ),
      ),
    );

  const renderStatus = () => {
    position.textContent = active ? `第 ${cursor.line} 行，第 ${cursor.column} 列` : "";
    lastRunEl.textContent = lastRun ?? "";
    const name = activePlugin();
    const info = name ? installed(name) : undefined;
    const row = (k: string, v: Child | ReadonlyArray<Child>) => [h("dt", null, k), h("dd", null, v)];
    replace(
      pluginBody,
      name
        ? h(
            "dl",
            { class: "kv" },
            row("草稿", h("span", { class: "mono" }, pluginDir(name))),
            row("插件 id", h("span", { class: "mono" }, devIdOf(name))),
            row("状态", info ? [statusDot(info.status), ` ${info.status}`] : h("span", { class: "dim" }, "未安装")),
            info?.lastError ? row("最近错误", h("span", { class: "error-text" }, `${info.lastError.tag}: ${info.lastError.message}`)) : null,
          )
        : h("div", { class: "dim" }, "尚无草稿"),
    );
  };

  const renderProblems = () => {
    const items: Array<Child> = [];
    if (error) items.push(h("div", { class: "error-text" }, error));
    for (const p of problems) {
      const { line, column } = lineCol(files[p.path] ?? "", p.from);
      items.push(
        h(
          "div",
          { class: "playground-problem", onclick: () => void show(p.path) },
          icon("cross-circle", "error-icon"),
          h("span", { class: "mono" }, `${p.path.slice(pluginDir(pluginOf(p.path)).length)}:${line}:${column}`),
          h("span", null, p.message),
        ),
      );
    }
    problemsCount.textContent = String(problems.length + (error ? 1 : 0));
    replace(problemsBody, items.length ? items : h("div", { class: "playground-problems-empty dim" }, "没有问题"));
  };

  const render = () => {
    renderActions();
    renderTree();
    renderTabs();
    renderStatus();
    renderProblems();
  };

  // ---------- 语言服务 ----------
  /** 以编辑器当前文档替换活动文件后的全部草稿（编辑器内容可能尚未写回 files） */
  const withDoc = (doc: string) => (active ? { ...files, [active]: doc } : files);
  const languageService = {
    diagnostics: async (doc: string) => (active ? compiler.diagnostics(withDoc(doc), active) : []),
    completions: async (doc: string, pos: number) => {
      const path = active;
      if (!path) return [];
      const entries = await compiler.completions(withDoc(doc), path, pos);
      return entries.map((e: CompletionEntry) => ({
        label: e.name,
        ...(completionType(e.kind) ? { type: completionType(e.kind)! } : {}),
        ...(e.insertText ? { apply: e.insertText } : {}),
        // TypeScript 的 sortText 越小越靠前；CodeMirror 的 boost 越大越靠前
        boost: -Math.min(99, Number.parseInt(e.sortText, 10) || 0),
        info: () => compiler.completionDetails(path, pos, e.name, e.source),
      }));
    },
    hover: async (doc: string, pos: number) => (active ? compiler.quickInfo(withDoc(doc), active, pos) : null),
  };

  // ---------- 编辑 ----------
  const showMessage = (text: string) => {
    message.textContent = text;
    message.hidden = false;
    editorEl.hidden = true;
  };

  const show = async (path: string) => {
    if (!(path in files)) return;
    if (!open.includes(path)) open.push(path);
    active = path;
    tree.reveal([pluginOf(path)]);
    render();
    message.hidden = true;
    editorEl.hidden = false;
    editor ??= import("@bbblank/devtools-ui/editor").then(({ createCodeEditor }) =>
      createCodeEditor(editorEl, {
        readOnly: false,
        languageService,
        onCursor: (c) => {
          cursor = c;
          renderStatus();
        },
        onChange: (doc) => {
          if (!active) return;
          files[active] = doc;
          save();
        },
      }),
    );
    const view = await editor;
    if (active === path) await view.show(files[path]!, path);
  };

  const close = (path: string) => {
    const i = open.indexOf(path);
    if (i < 0) return;
    open.splice(i, 1);
    if (active === path) {
      active = open[Math.min(i, open.length - 1)];
      if (active) return void show(active);
      showMessage("在左侧选择文件，或点击「新建插件」");
    }
    render();
  };

  const createPlugin = async () => {
    const name = window.prompt("插件名（小写字母开头，可含数字与连字符）", "hello")?.trim();
    if (!name) return;
    if (!NAME_PATTERN.test(name)) return void window.alert(`插件名不合法：${name}`);
    if (pluginNames(files).includes(name)) return void window.alert(`草稿 ${name} 已存在`);
    files = { ...files, ...template(name) };
    save();
    syncEntries();
    await show(`${pluginDir(name)}index.ts`);
  };

  const createFile = () => {
    const name = activePlugin();
    if (!name) return;
    const rel = window.prompt(`在 ${pluginDir(name)} 下新建文件`, "util.ts")?.trim();
    if (!rel) return;
    if (!/^[\w./-]+\.tsx?$/.test(rel) || rel.split("/").includes("..")) return void window.alert(`文件名不合法：${rel}`);
    const path = `${pluginDir(name)}${rel}`;
    if (path in files) return void show(path);
    files = { ...files, [path]: "" };
    save();
    void show(path);
  };

  const deleteFile = () => {
    if (!active || !window.confirm(`删除 ${active}？`)) return;
    const path = active;
    const { [path]: _, ...rest } = files;
    files = rest;
    save();
    syncEntries();
    close(path);
  };

  // ---------- 运行 ----------
  /**
   * 编译并安装草稿（卸载已安装的旧版本）。Playground 的「运行」与 Plugins 面板的「安装」共用；
   * 编译与运行错误显示在问题列表中，并以异常形式返回给调用方。
   */
  const install = async (name: string) => {
    busy = true;
    error = undefined;
    problems = [];
    lastRun = undefined;
    render();
    try {
      const r = await runner.run(name, files);
      if (!r.ok) {
        problems = r.problems;
        const first = r.problems[0]!;
        const { line, column } = lineCol(files[first.path] ?? "", first.from);
        throw new Error(`编译失败：${baseName(first.path)}:${line}:${column} ${first.message}（共 ${r.problems.length} 处）`);
      }
      lastRun = `运行耗时 ${r.ms} ms`;
    } catch (e) {
      // 链接错误的 message 已含文件路径；内核错误（带 _tag）按 describeError 展开字段
      if (!problems.length) error = e instanceof LinkError ? e.message : describeError(e);
      throw e;
    } finally {
      busy = false;
      render();
    }
  };

  const run = async () => {
    const name = activePlugin();
    if (name && !busy) await install(name).catch(() => {});
  };

  const stop = async () => {
    const name = activePlugin();
    if (!name || !installed(name)) return;
    busy = true;
    render();
    try {
      await runner.stop(devIdOf(name));
      lastRun = undefined;
    } catch (e) {
      error = describeError(e);
    } finally {
      busy = false;
      render();
    }
  };

  /** 每个草稿登记为 Plugins 面板中可安装的开发插件；草稿删除时撤销登记 */
  const syncEntries = () => {
    const names = new Set(pluginNames(files));
    for (const [name, off] of entries)
      if (!names.has(name)) {
        void off();
        entries.delete(name);
      }
    for (const name of names)
      if (!entries.has(name))
        entries.set(
          name,
          developer.register({
            id: devIdOf(name),
            name,
            source: "Playground",
            description: `Playground 草稿 ${pluginDir(name)}`,
            install: () => install(name),
          }),
        );
  };

  // 开发插件也可在 Plugins 面板中安装、启停、卸载：状态以内核为准
  const offPm = pm.subscribe(() => {
    renderActions();
    renderTree();
    renderStatus();
  });

  /** 首次可见时打开第一个文件（编辑器在面板可见后创建）；可见早于草稿读取完成时，读取完成后再打开 */
  let opened = false;
  let shownOnce = false;
  const openFirst = async () => {
    opened = true;
    const first = Object.keys(files).sort().find((p) => p.endsWith("/index.ts"));
    if (first) await show(first);
    else {
      showMessage("在左侧选择文件，或点击「新建插件」");
      render();
    }
  };

  showMessage("在左侧选择文件，或点击「新建插件」");
  render();

  return {
    el,
    init: async () => {
      // 合并而非覆盖：读取期间内存中若已有改动，以内存为准
      files = { ...(await loadWorkspace(storage)), ...files };
      loaded = true;
      syncEntries();
      render();
      if (shownOnce && !opened && !active) void openFirst();
    },
    update: (what) => {
      if (what !== "shown") return;
      shownOnce = true;
      if (loaded && !opened && !active) void openFirst();
    },
    dispose: () => {
      for (const off of entries.values()) void off();
      entries.clear();
      offPm();
      if (saveTimer) {
        clearTimeout(saveTimer);
        void saveWorkspace(storage, files);
      }
      void editor?.then((v) => v.destroy());
    },
  };
};
