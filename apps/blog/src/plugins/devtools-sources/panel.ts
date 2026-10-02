/**
 * Sources 面板：左侧为 apps/blog 的文件导航（对应 Chrome 的 Page 导航），右侧为可关闭的文件标签与只读源码视图。
 * 源码固定读取构建所对应的提交（见 ./repo）。
 */
import {
  h,
  icon,
  replace,
  splitWidget,
  toolbar,
  toolbarButton,
  toolbarFilter,
  toolbarText,
  treeOutline,
} from "@bbblank/devtools-ui";
import type { Child, IconName, PanelView, TreeNode } from "@bbblank/devtools-ui";
import type { Cursor, createEditor } from "./editor";
import { ROOT, build, fetchFile, githubUrl, listFiles } from "./repo";
import type { SourceFile } from "./repo";

const fileIcon = (name: string): Child => {
  const ext = name.slice(name.lastIndexOf(".") + 1);
  const [kind, glyph]: [string, IconName] = ["ts", "tsx", "js", "mjs", "jsx"].includes(ext)
    ? ["script", "file-script"]
    : ext === "css"
      ? ["styles", "file-stylesheet"]
      : ["html", "svg"].includes(ext)
        ? ["markup", "file-document"]
        : ["default", "document"];
  return icon(glyph, `file-icon ${kind}`);
};

interface Dir {
  readonly dirs: Map<string, Dir>;
  readonly files: Array<SourceFile>;
}

/** 仓库路径 → 目录树（相对 ROOT）；目录在前、文件在后，各自按名称排序（与 Chrome 导航一致） */
const toTree = (files: ReadonlyArray<SourceFile>, filter: string): ReadonlyArray<TreeNode> => {
  const root: Dir = { dirs: new Map(), files: [] };
  const q = filter.trim().toLowerCase();
  for (const f of files) {
    const rel = f.path.slice(ROOT.length);
    if (q && !rel.toLowerCase().includes(q)) continue;
    const parts = rel.split("/");
    let d = root;
    for (const p of parts.slice(0, -1)) {
      let next = d.dirs.get(p);
      if (!next) d.dirs.set(p, (next = { dirs: new Map(), files: [] }));
      d = next;
    }
    d.files.push(f);
  }
  const nodes = (d: Dir): ReadonlyArray<TreeNode> => [
    ...[...d.dirs.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, sub]) => ({
        key: name,
        label: [icon("folder", "file-icon folder"), name],
        children: nodes(sub),
      })),
    ...[...d.files]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => {
        const name = f.path.slice(f.path.lastIndexOf("/") + 1);
        return { key: f.path, label: [fileIcon(name), name], children: [] };
      }),
  ];
  return nodes(root);
};

export const sourcesPanel = (): PanelView => {
  const short = build.commit.slice(0, 7);
  let files: ReadonlyArray<SourceFile> = [];
  let filter = "";
  let listError: string | undefined;
  const open: Array<string> = [];
  let active: string | undefined;
  let cursor: Cursor = { line: 1, column: 1, selected: 0 };
  let loaded = false;

  const tree = treeOutline();
  tree.defaultCollapsed = true;
  tree.toggleOnClick = true;
  tree.onPick = (path) => void show(path);

  const navigator = h(
    "div",
    { class: "sources-navigator" },
    toolbar(toolbarFilter("过滤文件", (v) => {
      filter = v;
      renderTree();
    })),
    tree,
  );

  const tabs = h("div", { class: "tabbed-pane-header-tabs", role: "tablist" });
  const message = h("div", { class: "empty" });
  const editorEl = h("div", { class: "editor-view", hidden: true });
  const editorHost = h("div", { class: "editor-host" }, message, editorEl);
  const position = h("span", {});
  const origin = h("span", {});
  const editorPane = h(
    "div",
    { class: "sources-editor" },
    h("div", { class: "tabbed-pane-header" }, tabs),
    editorHost,
    h("div", { class: "status-bar" }, position, origin),
  );

  const split = splitWidget();
  split.sidebarSide = "left";
  split.sidebarWidth = 240;
  split.sidebar.append(navigator);
  split.main.append(editorPane);

  const head = toolbar(
    toolbarText(build.commit ? `提交 ${short}` : "构建时未取得提交号"),
    build.dirty ? toolbarText("· 本地有未提交改动，显示的是该提交在 GitHub 上的内容") : null,
    h("div", { class: "toolbar-spacer" }),
    toolbarButton("refresh", "重新读取文件列表", () => void loadList()),
  );
  const el = h("div", { class: "panel" }, head, split);

  let editor: Promise<ReturnType<typeof createEditor>> | undefined;

  const renderTree = () => {
    if (listError) return replace(tree, h("div", { class: "empty" }, listError));
    if (!loaded) return replace(tree, h("div", { class: "empty" }, "正在读取文件列表…"));
    tree.update(toTree(files, filter), active);
    // 过滤时展开全部匹配项所在目录
    if (filter.trim()) for (const f of files) tree.reveal(f.path.slice(ROOT.length).split("/").slice(0, -1));
  };

  const renderTabs = () =>
    replace(
      tabs,
      open.map((path) => {
        const name = path.slice(path.lastIndexOf("/") + 1);
        return h(
          "div",
          {
            class: `tabbed-pane-header-tab closeable${path === active ? " selected" : ""}`,
            role: "tab",
            title: path,
            "aria-selected": String(path === active),
            onclick: () => void show(path),
          },
          h("span", { class: "tabbed-pane-header-tab-icon" }, fileIcon(name)),
          h("span", { class: "tabbed-pane-header-tab-title" }, name),
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
        );
      }),
    );

  const renderStatus = () => {
    position.textContent = active
      ? `第 ${cursor.line} 行，第 ${cursor.column} 列${cursor.selected ? `（已选择 ${cursor.selected} 个字符）` : ""}`
      : "";
    replace(
      origin,
      active
        ? h("a", { href: githubUrl(build.commit, active, cursor.line), target: "_blank", rel: "noopener" }, "在 GitHub 上打开")
        : "",
    );
  };

  const showMessage = (text: string) => {
    message.textContent = text;
    message.hidden = false;
    editorEl.hidden = true;
  };

  const show = async (path: string) => {
    if (!open.includes(path)) open.push(path);
    active = path;
    renderTabs();
    renderTree();
    renderStatus();
    showMessage("正在读取…");
    try {
      const text = await fetchFile(build.commit, path);
      if (active !== path) return;
      message.hidden = true;
      editorEl.hidden = false;
      // 首次打开文件时加载 CodeMirror 并创建编辑器：此时面板已挂入 devtools 的 Shadow Root，编辑器样式据此挂到同一 root
      editor ??= import("./editor").then(({ createEditor }) =>
        createEditor(editorEl, (c) => {
          cursor = c;
          renderStatus();
        }),
      );
      const view = await editor;
      if (active === path) await view.show(text, path);
    } catch (e) {
      if (active === path) showMessage(`读取失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const close = (path: string) => {
    const i = open.indexOf(path);
    if (i < 0) return;
    open.splice(i, 1);
    if (active === path) {
      active = open[Math.min(i, open.length - 1)];
      if (active) return void show(active);
      showMessage("在左侧选择文件");
    }
    renderTabs();
    renderTree();
    renderStatus();
  };

  const loadList = async () => {
    listError = undefined;
    loaded = false;
    renderTree();
    if (!build.commit) {
      listError = "构建时未取得提交号，无法定位源码版本";
      return renderTree();
    }
    try {
      files = await listFiles(build.commit);
      loaded = true;
      renderTree();
      tree.reveal(["src"]);
      tree.reveal(["src", "plugins"]);
    } catch (e) {
      listError = e instanceof Error ? e.message : String(e);
      renderTree();
    }
  };

  showMessage("在左侧选择文件");
  return {
    el,
    update: (what) => {
      // 首次可见时才请求文件列表，避免安装即发起网络请求
      if (what === "shown" && !loaded && !listError) void loadList();
    },
  };
};
