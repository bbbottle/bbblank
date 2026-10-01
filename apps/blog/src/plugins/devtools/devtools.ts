/**
 * <bb-devtools>：底部抽屉。Shadow DOM 隔离站点样式（heti 等），内部为 Chrome 风格的标签页面板。
 * 抽屉高度与当前面板写入插件私有存储，打开状态不持久化（刷新后关闭）。
 */
import type { StorageFacade } from "@bbblank/sdk";
import type { Model } from "./model";
import { applicationPanel } from "./panels/application";
import { consolePanel, issueCount } from "./panels/console";
import { marketPanel } from "./panels/market";
import { networkPanel } from "./panels/network";
import type { Panel } from "./panels/panel";
import { pluginsPanel } from "./panels/plugins";
import { registerComponents, textButton, toolbarButton } from "./ui/components";
import { define, frameScheduler, h, replace } from "./ui/dom";
import { icon } from "./ui/icons";
import { styles } from "./ui/styles";
import { DEFAULT_SEED, isHexColor, paletteCss } from "./ui/theme";

const MIN_HEIGHT = 120;

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

/** dock(px)：为面板在页面底部预留 px 高度；dock(undefined)：取消预留 */
export const createDevtools = (
  model: Model,
  self: string,
  storage: StorageFacade,
  dock: (height: number | undefined) => void,
) => {
  registerComponents();
  define("bb-devtools", DevtoolsElement);
  const host = document.createElement("bb-devtools") as DevtoolsElement;
  host.hidden = true;
  const root = host.shadowRoot!;

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

  const panels: ReadonlyArray<Panel> = [
    pluginsPanel(model, self),
    consolePanel(model, self),
    networkPanel(model, self),
    applicationPanel(model, self),
    marketPanel(model, self),
  ];
  let current = panels[0]!;
  let height = 320;

  const tabs = h("div", { class: "tabbed-pane-header-tabs", role: "tablist" });
  const panelHost = h("div", { class: "panel-host" }, panels.map((p) => p.el));
  const renderTabs = () => {
    const issues = issueCount(model.activity);
    replace(
      tabs,
      panels.map((p) =>
        h(
          "button",
          {
            class: `tabbed-pane-header-tab${p === current ? " selected" : ""}`,
            role: "tab",
            "aria-selected": String(p === current),
            onclick: () => select(p),
          },
          p.title,
          p.id === "console" && issues ? h("span", { class: "tab-badge" }, icon("warning"), String(issues)) : null,
        ),
      ),
    );
  };

  const select = (p: Panel) => {
    current = p;
    for (const x of panels) x.el.hidden = x !== p;
    renderTabs();
    p.update("shown");
    void storage.set("tab", p.id);
  };

  const setHeight = (px: number) => {
    height = Math.max(MIN_HEIGHT, Math.min(window.innerHeight - 40, px));
    host.style.setProperty("--dt-height", `${height}px`);
    if (!host.hidden) dock(height);
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
      tabs,
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

  // 隐藏时不渲染（打开时 select 会整体刷新）；同一帧内的多次变化合并
  const dirty = new Set<"plugins" | "activity">();
  const flush = frameScheduler(() => {
    if (host.hidden) return dirty.clear();
    renderTabs();
    for (const what of dirty) current.update(what);
    dirty.clear();
  });
  const offModel = model.onChange((what) => {
    dirty.add(what);
    flush();
  });

  const open = () => {
    if (!host.hidden) return;
    host.hidden = false;
    dock(height);
    select(current);
  };
  const close = () => {
    host.hidden = true;
    dock(undefined);
  };

  void Promise.all([storage.get("height"), storage.get("tab"), storage.get("seed")]).then(([hgt, tab, seed]) => {
    setHeight(hgt ? Number(hgt) : 320);
    if (seed) setSeed(seed, false);
    const saved = panels.find((p) => p.id === tab);
    if (saved) current = saved;
    for (const x of panels) x.el.hidden = x !== current;
  });
  setHeight(height);
  for (const x of panels) x.el.hidden = x !== current;

  return { host, open, close, dispose: offModel };
};
