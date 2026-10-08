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

// ---------- 标签溢出（tabbedPane 的 >> 下拉） ----------

/**
 * 标签栏放不下时，把末尾的标签收进「>>」按钮（选中的标签始终保留）。标签元素须带 data-key 与 data-title。
 * - 鼠标设备：点击弹出页面内菜单（softContextMenu.css），固定在按钮下方（下方空间不足时在上方），与按钮右对齐；
 * - 触屏设备（pointer: coarse）：按钮上覆盖原生 <select>，点击弹出系统选择器。
 * 原生菜单在桌面上由操作系统定位（macOS 会把当前项对齐到控件上，菜单覆盖按钮），无法与按钮对齐，故只用于触屏。
 * strip 尺寸变化时自动重新计算；标签重新渲染后调用 update()。
 */
export const tabOverflow = (strip: HTMLElement, onSelect: (key: string) => void) => {
  const coarse = matchMedia("(pointer: coarse)");
  let hiddenTabs: ReadonlyArray<HTMLElement> = [];
  const menu = h("div", { class: "soft-context-menu", role: "menu", hidden: true });
  const onOutside = (e: Event) => {
    const path = e.composedPath();
    if (!path.includes(menu) && !path.includes(el)) closeMenu();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeMenu();
  };
  const closeMenu = () => {
    menu.hidden = true;
    menu.remove();
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
  };
  const openMenu = () => {
    replace(
      menu,
      hiddenTabs.map((t) =>
        h(
          "button",
          {
            class: "soft-context-menu-item",
            role: "menuitem",
            onclick: () => {
              closeMenu();
              onSelect(t.dataset.key!);
            },
          },
          t.dataset.title ?? t.textContent ?? "",
        ),
      ),
    );
    // 挂在按钮所在的根（devtools 的 Shadow Root）下，以 fixed 定位相对视口放置
    (el.getRootNode() as ShadowRoot | Document).append(menu);
    menu.hidden = false;
    const b = el.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const below = innerHeight - b.bottom;
    menu.style.maxHeight = `${Math.max(below, b.top) - 8}px`;
    menu.style.top = below >= m.height || below >= b.top ? `${b.bottom}px` : `${Math.max(4, b.top - Math.min(m.height, b.top - 8))}px`;
    menu.style.left = `${Math.max(4, Math.min(b.right - m.width, innerWidth - m.width - 4))}px`;
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
    (menu.firstElementChild as HTMLElement | null)?.focus();
  };
  const select = h("select", {
    class: "tabbed-pane-overflow-select",
    "aria-label": "更多标签",
    // 桌面 Chrome（含设备模拟）绘制的下拉菜单与 <select> 的起始边对齐：ltr 时左对齐并向右展开，
    // 按钮紧靠右侧时菜单越出视口；rtl 时改为右对齐、向左展开，与「>>」按钮右缘对齐。真机的系统选择器不受影响
    dir: "rtl",
    onchange: () => {
      const key = select.value;
      select.value = "";
      if (key) onSelect(key);
    },
  });
  const el = h(
    "div",
    {
      class: "tabbed-pane-header-tabs-drop-down-container",
      hidden: true,
      title: "更多标签",
      role: "button",
      tabindex: "0",
      "aria-haspopup": "menu",
      onclick: () => {
        if (coarse.matches) return; // 触屏由覆盖其上的原生 <select> 处理
        if (menu.hidden) openMenu();
        else closeMenu();
      },
      onkeydown: (e: KeyboardEvent) => {
        if ((e.key === "Enter" || e.key === " ") && !coarse.matches) {
          e.preventDefault();
          openMenu();
        }
      },
    },
    icon("chevron-double-right", "chevron-icon"),
    select,
  );

  const update = () => {
    const tabs = [...strip.children].filter((c): c is HTMLElement => c instanceof HTMLElement && !!c.dataset.key);
    for (const t of tabs) t.hidden = false;
    el.hidden = true;
    hiddenTabs = [];
    const avail = strip.clientWidth;
    const widths = tabs.map((t) => t.offsetWidth);
    if (!avail || widths.reduce((a, b) => a + b, 0) <= avail) return;
    el.hidden = false;
    const room = strip.clientWidth; // 按钮出现后 strip 变窄
    const selected = tabs.findIndex((t) => t.classList.contains("selected"));
    let used = selected >= 0 ? widths[selected]! : 0;
    const hidden: Array<HTMLElement> = [];
    tabs.forEach((t, i) => {
      if (i === selected) return;
      if (used + widths[i]! <= room) used += widths[i]!;
      else {
        t.hidden = true;
        hidden.push(t);
      }
    });
    hiddenTabs = hidden;
    if (!menu.hidden) closeMenu();
    replace(
      select,
      h("option", { value: "", disabled: true, selected: true }, "更多标签"),
      hidden.map((t) => h("option", { value: t.dataset.key! }, t.dataset.title ?? t.textContent ?? "")),
    );
  };

  new ResizeObserver(() => update()).observe(strip);
  return { el, update };
};

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

  /** 由调用方或用户拖动明确指定的宽度；否则为默认宽度 */
  #explicit = false;

  /**
   * 设置侧栏宽度（写入时即按约束显示，之后拖动从显示宽度连续变化）。
   * 挂载前设置的视为默认宽度（如 Sources 导航栏 240 px），挂载且可见后设置的视为明确指定。
   */
  set sidebarWidth(px: number) {
    this.#width = px;
    if (this.isConnected && this.clientWidth > 0) this.#explicit = true;
    this.#apply();
  }

  /**
   * 宽度约束：侧栏不少于 100 px，主区至少保留 120 px。
   * 默认宽度另要求主区不少于容器宽度的 40%（窄屏上侧栏自动收紧）；明确指定的宽度不受此限，
   * 否则调用方设置的较大比例（如详情窗格占 85%）会在第一次拖动时被突然截断。
   */
  static readonly MIN_MAIN = 120;
  static readonly MIN_SIDEBAR = 100;

  #clamp(px: number) {
    const w = this.clientWidth;
    if (!w) return px;
    const max = w - (this.#explicit ? SplitWidget.MIN_MAIN : Math.max(SplitWidget.MIN_MAIN, w * 0.4));
    return Math.max(SplitWidget.MIN_SIDEBAR, Math.min(max, px));
  }

  #apply() {
    this.sidebar.style.width = `${this.#clamp(this.#width)}px`;
  }

  readonly #observer = new ResizeObserver(() => this.#apply());

  disconnectedCallback() {
    this.#observer.disconnect();
  }

  connectedCallback() {
    this.#observer.observe(this);
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
    // 从当前显示的宽度开始（窄屏上显示宽度可能已被收紧，小于记录的宽度）
    const start = this.sidebar.getBoundingClientRect().width;
    this.#explicit = true;
    const sign = this.sidebarSide === "left" ? 1 : -1;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      this.#width = this.#clamp(start + sign * (ev.clientX - startX));
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
  /** 当前各行的 key 与选中项，供方向键切换选中行 */
  #keys: ReadonlyArray<string> = [];
  #selected: string | undefined;

  /**
   * 与 Chrome 的数据表格相同：表格可聚焦，点击行即获得焦点，选中行显示高亮色（tonal-container）；
   * 焦点移出表格时选中行退为浅色（neutral-container）。聚焦时上下方向键切换选中行。
   */
  connectedCallback() {
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.onkeydown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (!this.#keys.length) return;
      e.preventDefault();
      const i = this.#selected === undefined ? -1 : this.#keys.indexOf(this.#selected);
      const next = e.key === "ArrowDown" ? Math.min(this.#keys.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
      this.onPick(this.#keys[next]!);
      this.querySelector("tbody tr.selected")?.scrollIntoView({ block: "nearest" });
    };
  }
  /** 用户拖动后的列宽（px，按列 id）；重新渲染时沿用 */
  readonly #widths = new Map<string, number>();
  readonly #cols: Array<HTMLTableColElement> = [];

  /**
   * 拖动第 i 列右缘（dataGrid.css 的 .data-grid-resizer）：第 i 列与第 i+1 列此消彼长，表格总宽不变；
   * 开始拖动时把各列当前宽度固定为 px。
   */
  #startResize(e: PointerEvent, i: number, columns: ReadonlyArray<Column<R>>) {
    e.preventDefault();
    e.stopPropagation();
    const ths = [...this.querySelectorAll<HTMLTableCellElement>("thead th")];
    ths.forEach((th, j) => {
      this.#widths.set(columns[j]!.id, th.offsetWidth);
      this.#cols[j]!.style.width = `${th.offsetWidth}px`;
    });
    const a = columns[i]!.id;
    const b = columns[i + 1]!.id;
    const startX = e.clientX;
    const wa = this.#widths.get(a)!;
    const wb = this.#widths.get(b)!;
    const MIN = 32;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = Math.max(MIN - wa, Math.min(wb - MIN, ev.clientX - startX));
      this.#widths.set(a, wa + dx);
      this.#widths.set(b, wb - dx);
      this.#cols[i]!.style.width = `${wa + dx}px`;
      this.#cols[i + 1]!.style.width = `${wb - dx}px`;
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  }

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
    this.#keys = rows.map(key);
    this.#selected = opts.selected;
    const table = h(
      "table",
      { class: "data-grid" },
      h(
        "colgroup",
        null,
        (this.#cols.length = 0,
        columns.map((c) => {
          const px = this.#widths.get(c.id);
          const col = h("col", { style: px ? `width: ${px}px` : c.width ? `width: ${c.width}` : undefined });
          this.#cols.push(col);
          return col;
        })),
      ),
      h(
        "thead",
        null,
        h(
          "tr",
          null,
          columns.map((c, i) =>
            h(
              "th",
              { class: c.align === "end" ? "end" : undefined },
              c.title,
              i < columns.length - 1
                ? h("div", {
                    class: "data-grid-resizer",
                    title: "拖动以调整列宽",
                    onpointerdown: (e: PointerEvent) => this.#startResize(e, i, columns),
                    onclick: (e: Event) => e.stopPropagation(),
                  })
                : null,
            ),
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
              onclick: (e: MouseEvent) => {
                // 点击行时让表格获得焦点，选中行即显示高亮色；点在行内按钮等可交互元素上时由该元素获得焦点
                if (!(e.target as Element).closest("button, a, input, select, textarea")) this.focus({ preventScroll: true });
                this.onPick(k);
              },
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
