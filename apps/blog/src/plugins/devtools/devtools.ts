/**
 * <bb-devtools>：底部抽屉。Shadow DOM 隔离站点样式（heti 等），内部为 Chrome 风格的标签页。
 * 内置 Plugins 与 Market 面板；其余标签由面板插件经 DevtoolsPanels 服务登记，内容经 Dom.mount 挂入专属插槽。
 * 抽屉高度、当前标签与种子色写入插件私有存储，打开状态不持久化（刷新后关闭）。
 */
import type { Cleanup, StorageFacade } from "@bbblank/sdk";
import {
  DEFAULT_SEED,
  define,
  frameScheduler,
  h,
  icon,
  isHexColor,
  paletteCss,
  registerComponents,
  replace,
  styles,
  textButton,
  toolbarButton,
} from "@bbblank/devtools-ui";
import type { DevtoolsModel, PanelView } from "@bbblank/devtools-ui";
import type { DevtoolsPanelsService, PanelSpec } from "./api";
import { marketPanel } from "./panels/market";
import { createDeveloperRegistry } from "./developer";
import { pluginsPanel } from "./panels/plugins";

const MIN_HEIGHT = 120;
/** 缺省选中、且被移除标签时回退到的内置面板 */
const HOME = "plugins";

class DevtoolsElement extends HTMLElement {
  /** --color-ref-* 调色板，随种子色替换；tokens 与组件样式不变 */
  readonly palette = new CSSStyleSheet();

  constructor() {
    super();
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(styles);
    this.attachShadow({ mode: "open" }).adoptedStyleSheets = [this.palette, sheet];
  }
}

interface Tab {
  readonly id: string;
  readonly title: string;
  readonly order: number;
  readonly el: HTMLElement;
  badge: number;
  readonly shownListeners: Set<(shown: boolean) => void>;
}

export interface DevtoolsHost {
  /** dock(px)：为面板在页面底部预留 px 高度；dock(undefined)：取消预留 */
  readonly dock: (height: number | undefined) => void;
  /** 把元素提供为面板插槽 panelSlot(id) */
  readonly provideSlot: (id: string, el: HTMLElement) => Cleanup;
}

export const createDevtools = (
  model: DevtoolsModel,
  self: string,
  storage: StorageFacade,
  env: DevtoolsHost,
) => {
  registerComponents();
  define("bb-devtools", DevtoolsElement);
  const host = document.createElement("bb-devtools") as DevtoolsElement;
  host.hidden = true;
  const root = host.shadowRoot!;

  // ---------- 主题 ----------

  const colorInput = h("input", {
    type: "color",
    value: DEFAULT_SEED,
    oninput: (e: Event) => setSeed((e.target as HTMLInputElement).value, true),
  });
  const seedText = h("span", { class: "mono" }, DEFAULT_SEED);
  const setSeed = (seed: string, save: boolean) => {
    if (!isHexColor(seed)) return;
    host.palette.replaceSync(paletteCss(seed));
    colorInput.value = seed;
    seedText.textContent = seed;
    if (save) void storage.set("seed", seed);
  };
  setSeed(DEFAULT_SEED, false);
  const settings = h(
    "div",
    { class: "settings-popover", hidden: true },
    h("div", { class: "settings-title" }, "主题色"),
    h(
      "div",
      { class: "settings-hint" },
      "Chrome 以浏览器主题色生成 DevTools 调色板（Material TonalSpot）。页面读不到浏览器主题色，在此指定种子色。",
    ),
    h("label", { class: "settings-row" }, colorInput, seedText),
    h("div", { class: "actions" }, textButton("恢复默认", () => setSeed(DEFAULT_SEED, true))),
  );

  // ---------- 标签 ----------

  // 内置面板：Plugins 与 Market（安装入口不能随面板插件被卸载）；数据来自 devtools 自己的 model
  const developers = createDeveloperRegistry();
  const builtins = new Map<string, PanelView>([
    [HOME, pluginsPanel(model, self, developers)],
    ["market", marketPanel(model)],
  ]);
  const tabs = new Map<string, Tab>();
  const tabStrip = h("div", { class: "tabbed-pane-header-tabs", role: "tablist" });
  const panelHost = h("div", { class: "panel-host" });
  let current = HOME;
  /** 存储中记录的标签：面板插件可能晚于 devtools 登记，登记时再切换过去 */
  let wanted: string | undefined;
  let height = 320;

  const ordered = () => [...tabs.values()].sort((a, b) => a.order - b.order);
  const isShown = (id: string) => !host.hidden && id === current;

  const renderTabs = () =>
    replace(
      tabStrip,
      ordered().map((t) =>
        h(
          "button",
          {
            class: `tabbed-pane-header-tab${t.id === current ? " selected" : ""}`,
            role: "tab",
            "aria-selected": String(t.id === current),
            onclick: () => select(t.id),
          },
          t.title,
          t.badge ? h("span", { class: "tab-badge" }, icon("warning"), String(t.badge)) : null,
        ),
      ),
    );

  /** 选中项或抽屉开合变化后，通知可见性改变的面板 */
  const notify = (before: ReadonlySet<string>) => {
    for (const t of tabs.values()) {
      const now = isShown(t.id);
      if (now !== before.has(t.id)) for (const cb of t.shownListeners) cb(now);
    }
  };
  const visible = () => new Set([...tabs.keys()].filter(isShown));

  const select = (id: string, persist = true) => {
    if (!tabs.has(id)) return;
    const before = visible();
    current = id;
    for (const t of tabs.values()) t.el.hidden = t.id !== id;
    renderTabs();
    if (!host.hidden) builtins.get(id)?.update("shown");
    notify(before);
    if (persist) void storage.set("tab", id);
  };

  const addTab = (spec: PanelSpec, el: HTMLElement): Tab => {
    const tab: Tab = { id: spec.id, title: spec.title, order: spec.order ?? 100, el, badge: 0, shownListeners: new Set() };
    el.hidden = true;
    tabs.set(spec.id, tab);
    panelHost.append(el);
    renderTabs();
    return tab;
  };
  addTab({ id: HOME, title: "Plugins", order: 0 }, builtins.get(HOME)!.el);
  addTab({ id: "market", title: "Market", order: 1000 }, builtins.get("market")!.el);
  builtins.get(HOME)!.el.hidden = false;

  const panels: DevtoolsPanelsService = {
    register: (spec) => {
      if (tabs.has(spec.id)) throw new Error(`devtools panel "${spec.id}" is already registered`);
      const el = h("div", { class: "panel" });
      addTab(spec, el);
      const offSlot = env.provideSlot(spec.id, el);
      if (wanted === spec.id) select(spec.id, false);
      return () => {
        void offSlot();
        el.remove();
        tabs.delete(spec.id);
        if (current === spec.id) select(HOME, false);
        else renderTabs();
      };
    },
    setBadge: (id, count) => {
      const t = tabs.get(id);
      if (!t || t.badge === count) return;
      t.badge = count;
      renderTabs();
    },
    onShown: (id, cb) => {
      const t = tabs.get(id);
      if (!t) return () => {};
      t.shownListeners.add(cb);
      cb(isShown(id));
      return () => void t.shownListeners.delete(cb);
    },
  };

  // ---------- 抽屉 ----------

  const setHeight = (px: number) => {
    height = Math.max(MIN_HEIGHT, Math.min(window.innerHeight - 40, px));
    host.style.setProperty("--dt-height", `${height}px`);
    if (!host.hidden) env.dock(height);
  };

  const resizer = h("div", {
    class: "resizer",
    onpointerdown: (e: PointerEvent) => {
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      const startY = e.clientY;
      const start = height;
      const move = (ev: PointerEvent) => setHeight(start - (ev.clientY - startY));
      const up = () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        void storage.set("height", String(height));
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
    },
  });

  root.append(
    resizer,
    h(
      "div",
      { class: "tabbed-pane-header" },
      tabStrip,
      h(
        "div",
        { class: "tabbed-pane-right" },
        toolbarButton("gear", "设置", () => (settings.hidden = !settings.hidden)),
        toolbarButton("cross", "关闭 DevTools", () => close()),
      ),
    ),
    panelHost,
    settings,
  );

  // 内置面板：隐藏时不渲染（打开或切回时整体刷新）；同一帧内的多次变化合并
  const flush = frameScheduler(() => {
    if (!host.hidden) builtins.get(current)?.update("plugins");
  });
  const offModel = model.onChange((what) => {
    if (what === "plugins") flush();
  });
  const offDevelopers = developers.onChange(flush);

  const open = () => {
    if (!host.hidden) return;
    const before = visible();
    host.hidden = false;
    env.dock(height);
    builtins.get(current)?.update("shown");
    notify(before);
  };
  const close = () => {
    if (host.hidden) return;
    const before = visible();
    host.hidden = true;
    env.dock(undefined);
    notify(before);
  };

  void Promise.all([storage.get("height"), storage.get("tab"), storage.get("seed")]).then(
    ([hgt, tab, seed]) => {
      setHeight(hgt ? Number(hgt) : 320);
      if (seed) setSeed(seed, false);
      wanted = tab;
      if (tab && tabs.has(tab)) select(tab, false);
    },
  );
  setHeight(height);

  return {
    host,
    panels,
    developers: developers.service,
    open,
    close,
    dispose: () => {
      offModel();
      offDevelopers();
    },
  };
};
