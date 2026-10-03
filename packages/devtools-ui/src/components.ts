/**
 * 仿 Chrome DevTools 的基础组件（自定义元素）。组件不各自创建 Shadow Root：
 * 它们都渲染在 <bb-devtools> 的 Shadow Root 内，样式统一由 styles.ts 提供，设计 tokens 经 CSS 变量继承。
 */
import { append, define, h, replace } from "./dom.js";
import type { Child } from "./dom.js";
import { icon } from "./icons.js";
import type { IconName } from "./icons.js";

/** 插件状态色块（enabled / starting / stopping / disabled / failed / quarantined） */
export const statusDot = (status: string) =>
  h("span", { class: `status-dot status-${status}`, title: status });

// ---------- Toolbar ----------

export const toolbar = (...items: ReadonlyArray<Child>) =>
  h("div", { class: "toolbar" }, ...items);

export const toolbarButton = (
  name: IconName,
  title: string,
  onclick: () => void,
) =>
  h(
    "button",
    { class: "toolbar-button", title, "aria-label": title, onclick },
    icon(name),
  );

export const toolbarSeparator = () => h("div", { class: "toolbar-divider" });

export const toolbarText = (text: string) =>
  h("span", { class: "toolbar-text" }, text);

export const toolbarFilter = (
  placeholder: string,
  oninput: (value: string) => void,
) =>
  h(
    "label",
    { class: "toolbar-filter" },
    icon("filter"),
    h("input", {
      type: "text",
      placeholder,
      spellcheck: "false",
      oninput: (e: Event) => oninput((e.target as HTMLInputElement).value),
    }),
  );

export const toolbarCheckbox = (
  label: string,
  checked: boolean,
  onchange: (checked: boolean) => void,
) =>
  h(
    "label",
    { class: "toolbar-checkbox" },
    h("input", {
      type: "checkbox",
      checked,
      onchange: (e: Event) => onchange((e.target as HTMLInputElement).checked),
    }),
    label,
  );

export const textButton = (
  label: string,
  onclick: () => void,
  opts: { primary?: boolean; disabled?: boolean } = {},
) =>
  h(
    "button",
    {
      class: `text-button${opts.primary ? " primary" : ""}`,
      disabled: opts.disabled,
      onclick,
    },
    label,
  );

// ---------- SplitWidget：主区 + 可拖动宽度的侧栏 ----------

export class SplitWidget extends HTMLElement {
  readonly main = h("div", { class: "split-main" });
  readonly sidebar = h("div", { class: "split-sidebar" });
  /** 侧栏位置：right（Elements 的 Styles 窗格）或 left（Sources 的 Navigator）；须在挂载前设置 */
  sidebarSide: "left" | "right" = "right";
  #width = 320;
  readonly #resizer = h("div", {
    class: "split-resizer",
    onpointerdown: (e: PointerEvent) => this.#drag(e),
  });

  get sidebarShown() {
    return !this.sidebar.hidden;
  }

  /** 显示或隐藏侧栏（对应 Chrome 标签栏两端的「显示 / 隐藏导航栏、调试栏」按钮） */
  set sidebarShown(shown: boolean) {
    this.sidebar.hidden = !shown;
    this.#resizer.hidden = !shown;
  }

  set sidebarWidth(px: number) {
    this.#width = px;
    this.sidebar.style.width = `${px}px`;
  }

  connectedCallback() {
    if (this.childElementCount) return;
    const resizer = this.#resizer;
    this.sidebar.style.width = `${this.#width}px`;
    append(
      this,
      this.sidebarSide === "left"
        ? [this.sidebar, resizer, this.main]
        : [this.main, resizer, this.sidebar],
    );
  }

  #drag(e: PointerEvent) {
    const startX = e.clientX;
    const start = this.#width;
    const sign = this.sidebarSide === "left" ? 1 : -1;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      this.#width = Math.max(
        160,
        Math.min(this.clientWidth - 160, start + sign * (ev.clientX - startX)),
      );
      this.sidebar.style.width = `${this.#width}px`;
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  }
}

// ---------- 可折叠窗格（viewContainers.css 的 expandable-view-title，如 Sources 右栏的 Watch / Breakpoints） ----------

export const expandableSection = (title: Child | ReadonlyArray<Child>, body: HTMLElement, expanded = true) => {
  const arrow = h("span", { class: "title-expand-icon" });
  const head = h("div", { class: "expandable-view-title", role: "button", tabindex: "0", "aria-expanded": String(expanded) }, arrow, title);
  const set = (open: boolean) => {
    expanded = open;
    head.classList.toggle("expanded", open);
    head.setAttribute("aria-expanded", String(open));
    replace(arrow, icon(open ? "triangle-down" : "triangle-right"));
    body.hidden = !open;
  };
  head.onclick = () => set(!expanded);
  head.onkeydown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      set(!expanded);
    }
  };
  body.classList.add("expandable-view-body");
  set(expanded);
  return h("div", { class: "expandable-view" }, head, body);
};

// ---------- TreeOutline ----------

export interface TreeNode {
  readonly key: string;
  readonly label: Child | ReadonlyArray<Child>;
  readonly children: ReadonlyArray<TreeNode>;
}

export class TreeOutline extends HTMLElement {
  #nodes: ReadonlyArray<TreeNode> = [];
  #selected: string | undefined;
  /** defaultCollapsed 为 false 时记录被折叠的节点，为 true 时记录被展开的节点 */
  #toggled = new Set<string>();
  /** 节点缺省折叠（如 Sources 的文件树）；缺省展开（如 Plugins 的依赖树） */
  defaultCollapsed = false;
  /** 点击有子节点的行时切换折叠，而不是触发 onPick（目录行） */
  toggleOnClick = false;
  onPick: (key: string) => void = () => {};

  /** 展开 keys 路径上的各级节点（按 TreeNode.key 逐级匹配） */
  reveal(keys: ReadonlyArray<string>) {
    let path = "";
    for (const k of keys) {
      path = `${path}/${k}`;
      if (this.defaultCollapsed) this.#toggled.add(path);
      else this.#toggled.delete(path);
    }
    this.#render();
  }

  connectedCallback() {
    this.setAttribute("role", "tree");
    this.tabIndex = 0;
  }

  update(nodes: ReadonlyArray<TreeNode>, selected: string | undefined) {
    this.#nodes = nodes;
    this.#selected = selected;
    this.#render();
  }

  #render() {
    const rows: Array<HTMLElement> = [];
    const walk = (n: TreeNode, depth: number, path: string) => {
      const key = `${path}/${n.key}`;
      const open = this.#toggled.has(key) === this.defaultCollapsed;
      const flip = () => {
        if (this.#toggled.has(key)) this.#toggled.delete(key);
        else this.#toggled.add(key);
        this.#render();
      };
      const toggle = n.children.length
        ? h(
            "span",
            {
              class: "tree-toggle",
              onclick: (e: Event) => {
                e.stopPropagation();
                flip();
              },
            },
            icon(open ? "triangle-down" : "triangle-right"),
          )
        : h("span", { class: "tree-toggle" });
      rows.push(
        h(
          "div",
          {
            class: `tree-row${n.key === this.#selected ? " selected" : ""}`,
            role: "treeitem",
            style: `padding-left: ${4 + depth * 12}px`,
            onclick: () =>
              this.toggleOnClick && n.children.length ? flip() : this.onPick(n.key),
          },
          toggle,
          h("span", { class: "tree-label" }, n.label),
        ),
      );
      if (open) for (const c of n.children) walk(c, depth + 1, key);
    };
    for (const n of this.#nodes) walk(n, 0, "");
    replace(
      this,
      rows.length ? rows : h("div", { class: "empty" }, "没有可显示的内容"),
    );
  }
}

// ---------- DataGrid ----------

export interface Column<R> {
  readonly id: string;
  readonly title: string;
  /** CSS 宽度，缺省自动 */
  readonly width?: string;
  readonly align?: "start" | "end";
  readonly cell: (row: R) => Child | ReadonlyArray<Child>;
}

export class DataGrid<R = unknown> extends HTMLElement {
  onPick: (key: string) => void = () => {};

  update(
    columns: ReadonlyArray<Column<R>>,
    rows: ReadonlyArray<R>,
    key: (row: R) => string,
    opts: {
      selected?: string;
      rowClass?: (row: R) => string;
      empty?: string;
    } = {},
  ) {
    const table = h(
      "table",
      { class: "data-grid" },
      h(
        "colgroup",
        null,
        columns.map((c) =>
          h("col", { style: c.width ? `width: ${c.width}` : undefined }),
        ),
      ),
      h(
        "thead",
        null,
        h(
          "tr",
          null,
          columns.map((c) =>
            h("th", { class: c.align === "end" ? "end" : undefined }, c.title),
          ),
        ),
      ),
      h(
        "tbody",
        null,
        rows.map((r) => {
          const k = key(r);
          return h(
            "tr",
            {
              class:
                [
                  k === opts.selected ? "selected" : "",
                  opts.rowClass?.(r) ?? "",
                ]
                  .join(" ")
                  .trim() || undefined,
              onclick: () => this.onPick(k),
            },
            columns.map((c) =>
              h(
                "td",
                { class: c.align === "end" ? "end" : undefined },
                c.cell(r),
              ),
            ),
          );
        }),
      ),
    );
    replace(
      this,
      table,
      rows.length
        ? null
        : h("div", { class: "empty" }, opts.empty ?? "没有数据"),
    );
  }
}

export const registerComponents = () => {
  define("bbdt-split-widget", SplitWidget);
  define("bbdt-tree-outline", TreeOutline);
  define("bbdt-data-grid", DataGrid);
};

export const splitWidget = () =>
  document.createElement("bbdt-split-widget") as SplitWidget;
export const treeOutline = () =>
  document.createElement("bbdt-tree-outline") as unknown as TreeOutline;
export const dataGrid = <R>() =>
  document.createElement("bbdt-data-grid") as unknown as DataGrid<R>;
