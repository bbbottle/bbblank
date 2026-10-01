/**
 * 仿 Chrome DevTools 的基础组件（自定义元素）。组件不各自创建 Shadow Root：
 * 它们都渲染在 <bb-devtools> 的 Shadow Root 内，样式统一由 styles.ts 提供，设计 tokens 经 CSS 变量继承。
 */
import { append, define, h, replace } from "./dom";
import type { Child } from "./dom";
import { icon } from "./icons";
import type { IconName } from "./icons";

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
  #width = 320;

  connectedCallback() {
    if (this.childElementCount) return;
    const resizer = h("div", {
      class: "split-resizer",
      onpointerdown: (e: PointerEvent) => this.#drag(e),
    });
    this.sidebar.style.width = `${this.#width}px`;
    append(this, [this.main, resizer, this.sidebar]);
  }

  #drag(e: PointerEvent) {
    const startX = e.clientX;
    const start = this.#width;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      this.#width = Math.max(
        160,
        Math.min(this.clientWidth - 160, start - (ev.clientX - startX)),
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

// ---------- TreeOutline ----------

export interface TreeNode {
  readonly key: string;
  readonly label: Child | ReadonlyArray<Child>;
  readonly children: ReadonlyArray<TreeNode>;
}

export class TreeOutline extends HTMLElement {
  #nodes: ReadonlyArray<TreeNode> = [];
  #selected: string | undefined;
  #collapsed = new Set<string>();
  onPick: (key: string) => void = () => {};

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
      const open = !this.#collapsed.has(key);
      const toggle = n.children.length
        ? h(
            "span",
            {
              class: "tree-toggle",
              onclick: (e: Event) => {
                e.stopPropagation();
                if (open) this.#collapsed.add(key);
                else this.#collapsed.delete(key);
                this.#render();
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
            onclick: () => this.onPick(n.key),
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
