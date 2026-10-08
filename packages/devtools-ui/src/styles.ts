/**
 * devtools 样式：颜色、尺寸、圆角取自 vendor/design_system_tokens.css（Chrome DevTools 设计 tokens），
 * 布局数值参照 chrome-devtools-frontend 的 tabbedPane.css / toolbar.css / dataGrid.css（浅色主题）。
 */
import { designTokens as tokens } from "./generated/assets.js";

const base = /* css */ `
:host {
  /* application_tokens.css 中本组件用到的少量变量 */
  --app-color-toolbar-background: var(--sys-color-surface4);
  --icon-default: var(--sys-color-on-surface-subtle);
  --icon-default-hover: var(--sys-color-on-surface);
  --text-link: var(--sys-color-primary);
  --drop-shadow: 0 0 0 1px rgb(0 0 0 / 5%), 0 2px 4px rgb(0 0 0 / 20%), 0 2px 6px rgb(0 0 0 / 10%);
  --sys-typescale-body4-size: 12px;
  --sys-typescale-body4-line-height: 16px;
  --default-font-family: system-ui, sans-serif;
  --monospace-font-family: ui-monospace, Menlo, monospace;
  --monospace-font-size: 11px;
  /* design_system_tokens.css 中 .platform-mac 的取值；该类由 Chrome 在宿主上设置，此处直接采用 */
  --source-code-font-family: monospace;
  --source-code-font-size: 11px;

  all: initial;
  position: fixed;
  inset: auto 0 0 0;
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  height: var(--dt-height, 320px);
  background: var(--sys-color-cdt-base-container);
  color: var(--sys-color-on-surface);
  font-family: var(--default-font-family);
  font-size: var(--sys-typescale-body4-size);
  line-height: var(--sys-typescale-body4-line-height);
  border-top: var(--sys-size-1) solid var(--sys-color-divider);
  box-sizing: border-box;
  -webkit-font-smoothing: antialiased;
}
:host([hidden]) { display: none; }
*, *::before, *::after { box-sizing: border-box; }
button, input { font: inherit; color: inherit; }

.resizer { position: absolute; inset: -3px 0 auto 0; height: 6px; cursor: ns-resize; z-index: 1; touch-action: none; }

/* ---------- tabbed pane ---------- */
.tabbed-pane-header {
  display: flex; flex: 0 0 27px; align-items: stretch;
  border-bottom: var(--sys-size-1) solid var(--sys-color-divider);
  background-color: var(--app-color-toolbar-background);
}
.tabbed-pane-header-tabs { display: flex; flex: auto; overflow: hidden; min-width: 0; }
.tabbed-pane-header-tab[hidden] { display: none; }
/* 标签溢出：>> 按钮上覆盖透明的原生 <select>，点击弹出系统菜单（tabbedPane.css 的 drop-down-container） */
.tabbed-pane-header-tabs-drop-down-container {
  position: relative; flex: none; display: flex; align-items: center; justify-content: center;
  width: 24px; opacity: 80%;
}
.tabbed-pane-header-tabs-drop-down-container[hidden] { display: none; }
.tabbed-pane-header-tabs-drop-down-container:hover { background-color: var(--sys-color-state-hover-on-subtle); opacity: 100%; }
.tabbed-pane-header-tabs-drop-down-container .chevron-icon { width: 16px; height: 16px; }
.tabbed-pane-overflow-select {
  position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer;
  /* 16px 防止 iOS Safari 聚焦时缩放页面 */
  font-size: 16px; border: 0; appearance: none;
  /* 鼠标设备使用页面内菜单，原生 <select> 不接收点击 */
  pointer-events: none;
}
@media (pointer: coarse) { .tabbed-pane-overflow-select { pointer-events: auto; } }
/* 页面内菜单（softContextMenu.css） */
.soft-context-menu {
  position: fixed; z-index: 3; overflow-y: auto; min-width: var(--sys-size-23);
  padding: var(--sys-size-5) 0;
  border: var(--sys-size-1) solid var(--sys-color-neutral-outline);
  border-radius: var(--sys-shape-corner-small);
  background-color: var(--sys-color-base-container-elevated);
  box-shadow: var(--sys-elevation-level3);
}
.soft-context-menu[hidden] { display: none; }
.soft-context-menu-item {
  display: flex; width: 100%; height: var(--sys-size-11); padding: 0 var(--sys-size-8); align-items: center;
  border: 0; background: none; color: var(--sys-color-on-surface); font-size: var(--sys-typescale-body4-size);
  white-space: nowrap; text-align: left; cursor: default;
}
.soft-context-menu-item:hover, .soft-context-menu-item:focus-visible { background-color: var(--sys-color-state-hover-on-subtle); outline: none; }
.tabbed-pane-header-tab {
  position: relative; display: flex; align-items: center; gap: var(--sys-size-3);
  /* tabbedPane.css：font: var(--sys-typescale-body4-medium)，即 500 12px/16px */
  font: var(--sys-typescale-body4-medium);
  padding: 0 10px; color: var(--sys-color-on-surface-subtle);
  white-space: nowrap; cursor: default; user-select: none;
  border: 0; background: none;
}
.tabbed-pane-header-tab:hover { color: var(--sys-color-on-surface); background-color: var(--sys-color-state-hover-on-subtle); }
.tabbed-pane-header-tab.selected { color: var(--sys-color-primary); }
.tabbed-pane-header-tab.selected::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: calc(-1 * var(--sys-size-1)); height: 3px;
  background-color: var(--sys-color-primary);
  border-radius: var(--sys-shape-corner-full) var(--sys-shape-corner-full) 0 0;
}
.tab-badge {
  display: inline-flex; align-items: center; gap: 2px; padding: 0 var(--sys-size-3);
  border-radius: var(--sys-shape-corner-full);
  background: var(--sys-color-surface-yellow); color: var(--sys-color-on-surface-yellow);
}
.tab-badge .icon { width: 14px; height: 14px; color: var(--sys-color-orange-bright); }
.tabbed-pane-right { display: flex; align-items: center; padding-right: var(--sys-size-3); }
.panel-host { flex: auto; display: flex; min-height: 0; }
.panel { flex: auto; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.panel[hidden] { display: none; }
/* 面板插件经 Dom.mount 挂入面板插槽时，宿主生成的挂载节点 <div data-plugin> 占满面板 */
.panel > [data-plugin], .panel-root { flex: auto; display: flex; flex-direction: column; min-width: 0; min-height: 0; }

/* ---------- icons ---------- */
.icon { display: inline-flex; width: 20px; height: 20px; color: var(--icon-default); flex: none; }
.icon svg { width: 100%; height: 100%; }

/* ---------- toolbar（inspectorCommon.css 的 devtools-toolbar） ---------- */
.toolbar {
  display: flex; align-items: center; flex: 0 0 auto; height: 26px;
  padding: 0 var(--sys-size-2);
  border-bottom: var(--sys-size-1) solid var(--sys-color-divider);
  background-color: var(--sys-color-cdt-base-container);
}
/* 图标按钮（buttons/button.css 的 devtools-button.icon）：26px 圆形，悬停叠加 hover 层、按下叠加 ripple 层 */
.toolbar-button {
  position: relative; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; margin: 0 1px; padding: 0; border: 0;
  border-radius: var(--sys-shape-corner-full);
  background: transparent; cursor: default; outline: none;
}
.toolbar-button .icon { width: var(--sys-size-9); height: var(--sys-size-9); }
.toolbar-button:hover::after,
.toolbar-button:active::before {
  content: ""; position: absolute; inset: 0; border-radius: inherit;
}
.toolbar-button:hover::after { background-color: var(--sys-color-state-hover-on-subtle); }
.toolbar-button:active::before { background-color: var(--sys-color-state-ripple-neutral-on-subtle); }
.toolbar-button:hover .icon { color: var(--icon-default-hover); }
.toolbar-button:focus-visible { outline: var(--sys-size-2) solid var(--sys-color-state-focus-ring); outline-offset: calc(-1 * var(--sys-size-2)); }
.toolbar-divider { width: var(--sys-size-1); height: var(--sys-size-8); margin: 5px var(--sys-size-3); background: var(--sys-color-divider); flex: none; }
.toolbar-text { color: var(--sys-color-on-surface); margin: 0 5px; white-space: nowrap; }
.toolbar-filter {
  position: relative; z-index: 0; display: flex; align-items: center;
  height: var(--sys-size-9); min-width: 5.2em; max-width: 300px; flex: 1 1 auto;
  margin: var(--sys-size-1) 3px; padding: 0 var(--sys-size-2) 0 var(--sys-size-5);
  border-radius: var(--sys-shape-corner-full);
  box-shadow: inset 0 0 0 var(--sys-size-2) transparent;
}
.toolbar-filter::before {
  content: ""; position: absolute; inset: 0; z-index: -1;
  border-radius: inherit; background: var(--sys-color-cdt-base);
}
.toolbar-filter:hover { background-color: var(--sys-color-state-hover-on-subtle); }
.toolbar-filter:focus-within { box-shadow: inset 0 0 0 var(--sys-size-2) var(--sys-color-state-focus-ring); }
.toolbar-filter .icon { width: var(--sys-size-8); height: var(--sys-size-8); margin-right: var(--sys-size-3); color: var(--sys-color-on-surface-subtle); }
.toolbar-filter input { flex: auto; min-width: 0; border: 0; outline: 0; background: transparent; padding: 0; color: var(--sys-color-on-surface); }
.toolbar-filter input::placeholder { color: var(--sys-color-on-surface-subtle); }
.toolbar-checkbox { display: inline-flex; align-items: center; gap: var(--sys-size-3); padding: 0 var(--sys-size-4); white-space: nowrap; }
.toolbar-checkbox input { margin: 0; accent-color: var(--sys-color-primary); }
.toolbar-spacer { flex: auto; }

.text-button {
  height: 24px; padding: 0 var(--sys-size-6); border-radius: var(--sys-shape-corner-full); cursor: pointer;
  border: var(--sys-size-1) solid var(--sys-color-tonal-outline);
  background: var(--sys-color-cdt-base-container); color: var(--sys-color-primary);
}
.text-button:hover { background: var(--sys-color-state-hover-on-subtle); }
.text-button.primary { background: var(--sys-color-primary); color: var(--sys-color-on-primary); border-color: var(--sys-color-primary); }
.text-button:disabled { cursor: default; color: var(--sys-color-state-disabled); background: var(--sys-color-state-disabled-container); border-color: transparent; }

/* ---------- split widget ---------- */
bbdt-split-widget { flex: auto; display: flex; min-height: 0; }
.split-main { flex: auto; overflow: auto; min-width: 0; }
.split-resizer { flex: 0 0 1px; background: var(--sys-color-divider); cursor: ew-resize; position: relative; touch-action: none; z-index: 1; }
.split-resizer::after { content: ""; position: absolute; inset: 0 -3px; }
.split-sidebar { flex: none; overflow: auto; background: var(--sys-color-cdt-base-container); }

/* ---------- tree outline ---------- */
bbdt-tree-outline { display: block; padding: 2px 0; outline: none; }
.tree-row { display: flex; align-items: center; height: 20px; padding-right: var(--sys-size-4); white-space: nowrap; cursor: default; }
.tree-row:hover { background: var(--sys-color-state-hover-on-subtle); }
.tree-row.selected { background: var(--sys-color-tonal-container); }
.tree-toggle { display: inline-flex; width: 14px; flex: none; }
.tree-toggle .icon { width: 14px; height: 14px; }
.tree-label { display: inline-flex; align-items: center; gap: var(--sys-size-3); overflow: hidden; text-overflow: ellipsis; }

/* ---------- data grid（dataGrid.css） ---------- */
bbdt-data-grid { display: block; flex: auto; overflow: auto; min-height: 0; background: var(--sys-color-cdt-base-container); }
.data-grid { width: 100%; border-spacing: 0; border-collapse: separate; table-layout: fixed; line-height: 120%; }
.data-grid th, .data-grid td {
  height: 18px; line-height: 18px; padding: var(--sys-size-1) var(--sys-size-3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  border-left: var(--sys-size-1) solid var(--sys-color-divider);
}
.data-grid th {
  position: sticky; top: 0; z-index: 1;
  text-align: left; font-weight: normal; vertical-align: middle;
  background-color: var(--sys-color-surface1);
  border-bottom: var(--sys-size-1) solid var(--sys-color-divider);
}
.data-grid td { vertical-align: top; user-select: text; }
.data-grid th:first-child, .data-grid td:first-child { border-left-width: 0; }
/* 列宽拖动（dataGrid.css 的 .data-grid-resizer）：th 为 sticky（已定位）且 overflow: hidden，手柄放在其内侧右缘 */
.data-grid-resizer { position: absolute; top: 0; bottom: 0; right: 0; width: 5px; z-index: 2; cursor: col-resize; touch-action: none; }
.data-grid td.end { text-align: right; }
.data-grid tbody tr { height: var(--sys-size-9); background-color: var(--sys-color-surface); }
/* striped-data-grid：奇数行着色 */
.data-grid tbody tr:nth-child(odd):not(.selected) { background-color: var(--sys-color-surface1); }
.data-grid tbody tr:not(.selected):hover { background-color: var(--sys-color-state-hover-on-subtle); }
.data-grid tbody tr.selected { background-color: var(--sys-color-neutral-container); }
bbdt-data-grid:focus-within .data-grid tbody tr.selected { background-color: var(--sys-color-tonal-container); }
.data-grid tbody tr.error { background-color: var(--sys-color-surface-error); }
.data-grid tbody tr.error td { color: var(--sys-color-on-surface-error); }

.empty { padding: var(--sys-size-8); text-align: center; color: var(--sys-color-on-surface-subtle); }
.dim { color: var(--sys-color-on-surface-subtle); }
.mono { font-family: var(--monospace-font-family); font-size: var(--monospace-font-size); }

/* ---------- status ---------- */
.status-dot { display: inline-block; width: 8px; height: 8px; flex: none; }
.status-enabled { background: var(--sys-color-green-bright); }
.status-starting, .status-stopping { background: var(--sys-color-orange-bright); }
.status-disabled { background: var(--sys-color-neutral-outline); }
.status-failed, .status-quarantined { background: var(--sys-color-error-bright); }

/* ---------- sidebar sections（仿 Styles 窗格） ---------- */
.section { border-bottom: var(--sys-size-1) solid var(--sys-color-divider); }
.section-title {
  display: flex; align-items: center; height: 22px; padding: 0 var(--sys-size-4);
  background: var(--sys-color-surface1); font-weight: var(--ref-typeface-weight-medium);
}
.section-body { padding: var(--sys-size-3) var(--sys-size-6); }
.kv { display: grid; grid-template-columns: max-content 1fr; gap: 2px var(--sys-size-6); }
.kv dt { color: var(--sys-color-token-property); }
.kv dd { margin: 0; overflow-wrap: anywhere; }
.chip {
  display: inline-flex; align-items: center; gap: var(--sys-size-2); height: 18px; padding: 0 var(--sys-size-4);
  border-radius: var(--sys-shape-corner-full); background: var(--sys-color-neutral-container);
}
.actions { display: flex; flex-wrap: wrap; gap: var(--sys-size-4); padding: var(--sys-size-4) var(--sys-size-6); }
.banner {
  margin: var(--sys-size-4) var(--sys-size-6); padding: var(--sys-size-4) var(--sys-size-6);
  border-radius: var(--sys-shape-corner-extra-small);
}
.banner.warning { background: var(--sys-color-surface-yellow); color: var(--sys-color-on-surface-yellow); }
.banner.error { background: var(--sys-color-surface-error); color: var(--sys-color-on-surface-error); }
.banner .actions { padding: var(--sys-size-4) 0 0; }
.error-text { color: var(--sys-color-error); }
.split-main > .developer-section { border-top: var(--sys-size-1) solid var(--sys-color-divider); border-bottom: 0; }
.developer-section[hidden] { display: none; }
.developer-entry { display: flex; align-items: center; gap: var(--sys-size-4); min-height: 28px; }
.developer-entry > .dim:nth-of-type(3) { flex: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ok-text { color: var(--sys-color-green); }

/* ---------- console ---------- */
.console { flex: auto; overflow: auto; min-height: 0; font-family: var(--monospace-font-family); font-size: var(--monospace-font-size); }
.console-message {
  display: flex; align-items: flex-start; gap: var(--sys-size-3); min-height: 20px;
  padding: 2px var(--sys-size-6) 2px var(--sys-size-4);
  border-bottom: var(--sys-size-1) solid var(--sys-color-divider);
}
.console-message > .icon { width: 16px; height: 16px; margin-top: 0; }
.console-message.warning { background: var(--sys-color-surface-yellow); color: var(--sys-color-on-surface-yellow); border-color: var(--sys-color-yellow-outline); }
.console-message.warning > .icon { color: var(--sys-color-orange-bright); }
.console-message.error { background: var(--sys-color-surface-error); color: var(--sys-color-on-surface-error); border-color: var(--sys-color-error-outline); }
.console-message.error > .icon { color: var(--sys-color-error-bright); }
.console-text { flex: auto; min-width: 0; overflow-wrap: anywhere; }
.console-meta { flex: none; color: var(--sys-color-on-surface-subtle); white-space: nowrap; }
.console-source { color: var(--text-link); }
.publisher { color: var(--sys-color-token-tag); }

/* ---------- object preview ---------- */
.object { display: inline; }
.object-head { cursor: default; }
.object-toggle { display: inline-flex; vertical-align: middle; }
.object-toggle .icon { width: 12px; height: 12px; }
.object-children { padding-left: 14px; }
.tok-property { color: var(--sys-color-token-property-special); }
.tok-string { color: var(--sys-color-token-string); }
.tok-number { color: var(--sys-color-token-number); }
.tok-keyword { color: var(--sys-color-token-keyword); }

/* ---------- network waterfall ---------- */
.waterfall { position: relative; height: 12px; }
.waterfall-bar { position: absolute; top: 2px; height: 8px; min-width: 2px; border-radius: 1px; }
.phase-load { background: var(--sys-color-blue-bright); }
.phase-setup { background: var(--sys-color-purple-bright); }
.phase-stop { background: var(--sys-color-neutral-outline); }
.waterfall-bar.error { background: var(--sys-color-error-bright); }
/* Network 底部汇总：各项以竖线分隔 */
.status-bar {
  flex: 0 0 auto; display: flex; align-items: center; height: 26px; padding: 0 var(--sys-size-2);
  border-top: var(--sys-size-1) solid var(--sys-color-divider); background: var(--sys-color-cdt-base-container);
  color: var(--sys-color-on-surface); white-space: nowrap;
}
.status-bar > span { padding: 0 var(--sys-size-4); }
.status-bar > span + span { border-left: var(--sys-size-1) solid var(--sys-color-divider); }

/* ---------- settings ---------- */
.settings-popover {
  position: absolute; top: 28px; right: var(--sys-size-4); z-index: 2; width: 280px;
  padding: var(--sys-size-4) 0; border-radius: var(--sys-shape-corner-small);
  background: var(--sys-color-base-container-elevated);
  box-shadow: var(--sys-elevation-level3, 0 2px 6px rgb(0 0 0 / 20%));
}
.settings-popover[hidden] { display: none; }
.settings-title { padding: 0 var(--sys-size-6); font-weight: var(--ref-typeface-weight-medium); }
.settings-hint { padding: var(--sys-size-3) var(--sys-size-6); color: var(--sys-color-on-surface-subtle); }
.settings-row { display: flex; align-items: center; gap: var(--sys-size-4); padding: var(--sys-size-3) var(--sys-size-6); }
.settings-row input[type="color"] { width: 32px; height: 20px; padding: 0; border: 0; background: none; }

/* ---------- application ---------- */
.app-layout { flex: auto; display: flex; min-height: 0; }
.app-nav { flex: 0 0 200px; overflow: auto; border-right: var(--sys-size-1) solid var(--sys-color-divider); padding: var(--sys-size-3) 0; }
.app-nav-heading { padding: var(--sys-size-3) var(--sys-size-6); color: var(--sys-color-on-surface-subtle); font-weight: var(--ref-typeface-weight-medium); }
.app-nav-item { display: flex; align-items: center; height: 22px; padding: 0 var(--sys-size-6) 0 20px; cursor: default; }
.app-nav-item:hover { background: var(--sys-color-state-hover-on-subtle); }
.app-nav-item.selected { background: var(--sys-color-tonal-container); }
.app-content { flex: auto; display: flex; flex-direction: column; min-width: 0; }

.grid-name { display: inline-flex; align-items: center; gap: var(--sys-size-3); vertical-align: top; }
.grid-name .icon { width: 16px; height: 16px; margin-top: 1px; color: var(--sys-color-orange); }

/* ---------- market ---------- */
.market-name { display: inline-flex; align-items: center; gap: var(--sys-size-3); }
.market-name .icon { width: 16px; height: 16px; }

/* ---------- 可关闭的标签（tabbedPane.css 的 .closeable / .tabbed-pane-close-button） ---------- */
.tabbed-pane-header-tab.closeable { padding-right: var(--sys-size-3); }
.tabbed-pane-header-tab-icon { min-width: var(--sys-size-7); display: flex; align-items: center; margin-right: var(--sys-size-2); }
.tabbed-pane-header-tab-icon .icon { width: 16px; height: 16px; }
.tabbed-pane-close-button { visibility: hidden; display: inline-flex; border-radius: var(--sys-shape-corner-full); }
.tabbed-pane-close-button .icon { width: 16px; height: 16px; }
.tabbed-pane-close-button:hover { background-color: var(--sys-color-state-hover-on-subtle); }
.tabbed-pane-header-tab:hover .tabbed-pane-close-button,
.tabbed-pane-header-tab.selected .tabbed-pane-close-button { visibility: visible; }

/* ---------- Sources：导航文件图标（application_tokens.css 的 --icon-file-* / --icon-folder-*） ---------- */
.tree-label .icon.file-icon { width: 16px; height: 16px; }
.file-icon.folder { color: var(--sys-color-on-surface-subtle); }
.file-icon.script { color: var(--sys-color-orange-bright); }
.file-icon.styles { color: var(--sys-color-purple-bright); }
.file-icon.markup { color: var(--sys-color-blue-bright); }
.file-icon.default { color: var(--sys-color-on-surface-subtle); }
.sources-navigator { display: flex; flex-direction: column; height: 100%; }
.sources-navigator > bbdt-tree-outline { flex: auto; overflow: auto; }
.sources-editor { display: flex; flex-direction: column; height: 100%; }
.sources-editor > .editor-host { flex: auto; min-height: 0; overflow: hidden; background: var(--sys-color-cdt-base-container); }
.editor-host > .editor-view { height: 100%; }
.editor-host > [hidden] { display: none; }
.sources-editor > .tabbed-pane-header { border-top: 0; }

/* ---------- 可折叠窗格（viewContainers.css） ---------- */
.expandable-view-title {
  display: flex; align-items: center; height: var(--sys-size-10); padding: 0 5px;
  background-color: var(--sys-color-surface2); white-space: nowrap; overflow: hidden; position: relative;
  border-bottom: var(--sys-size-1) solid transparent; cursor: default; user-select: none;
}
.expandable-view-title.expanded, .expandable-view:last-child > .expandable-view-title { border-bottom: var(--sys-size-1) solid var(--sys-color-divider); }
.expandable-view-title:focus-visible { outline: none; background-color: var(--sys-color-state-focus-highlight); }
.title-expand-icon { display: inline-flex; margin-right: var(--sys-size-2); }
.title-expand-icon .icon { width: 14px; height: 14px; }
.expandable-view-body[hidden] { display: none; }
.expandable-view-title .count { margin-left: var(--sys-size-3); color: var(--sys-color-on-surface-subtle); }
.split-resizer[hidden], .split-sidebar[hidden] { display: none; }
/* 嵌套分栏（三栏布局）：内层须撑满外层主区，否则高度随内容增长，编辑器失去自身的滚动区域，
   光标滚动会连带滚动外层容器，把标签栏与侧栏移出可视区域 */
.split-main > bbdt-split-widget { height: 100%; }
.split-main:has(> .sources-editor), .split-main:has(> bbdt-split-widget) { overflow: hidden; }

/* ---------- 窄屏：表格保持最小宽度并横向滚动，避免各列被压缩到无法阅读 ---------- */
@media (max-width: 640px) {
  .data-grid { min-width: 560px; }
}

/* ---------- 触屏：拖动手柄加大可触区域 ---------- */
@media (pointer: coarse) {
  .resizer { inset: -10px 0 auto 0; height: 20px; }
  .split-resizer::after { inset: 0 -10px; }
  .data-grid-resizer { width: 14px; }
}

/* ---------- Playground ---------- */
.playground-sidebar { display: flex; flex-direction: column; height: 100%; overflow: auto; }
.playground-sidebar > .toolbar { flex: none; }
.playground-plugin { padding: var(--sys-size-3) var(--sys-size-6); }
.playground-plugin > .kv { margin: 0; }
.playground-problems { overflow: auto; }
.playground-problems > .error-text { padding: var(--sys-size-2) var(--sys-size-6); white-space: pre-wrap; }
.playground-problems-empty { padding: var(--sys-size-3) 0; text-align: center; font-style: italic; }
.playground-problem { display: flex; align-items: flex-start; gap: var(--sys-size-3); padding: 2px var(--sys-size-6); cursor: default; }
.playground-problem:hover { background: var(--sys-color-state-hover-on-subtle); }
.playground-problem .error-icon { width: 14px; height: 14px; margin-top: 1px; color: var(--sys-color-error); flex: none; }
.playground-problem > .mono { flex: none; color: var(--sys-color-token-subtle); }
/* 标签栏两端的显示 / 隐藏侧栏按钮 */
.tabbed-pane-header > .tabbed-pane-side-button { align-self: center; flex: none; }
/* 导航空状态的新建入口（Overrides 的「+ Select folder for overrides」） */
.navigator-add {
  display: inline-flex; align-items: center; gap: var(--sys-size-3); margin: var(--sys-size-3) var(--sys-size-6);
  padding: 0; border: 0; background: none; color: var(--sys-color-primary); cursor: pointer;
}
.navigator-add .icon { width: 16px; height: 16px; color: inherit; }
.navigator-add:hover { text-decoration: underline; }

/* ---------- 语法着色（code_highlighter/codeHighlighter.css，BSD-3-Clause） ---------- */
.token-variable { color: var(--sys-color-token-variable); }
.token-property { color: var(--sys-color-token-property); }
.token-type { color: var(--sys-color-token-type); }
.token-variable-special { color: var(--sys-color-token-variable-special); }
.token-definition { color: var(--sys-color-token-definition); }
.token-builtin { color: var(--sys-color-token-builtin); }
.token-number { color: var(--sys-color-token-number); }
.token-string { color: var(--sys-color-token-string); }
.token-string-special { color: var(--sys-color-token-string-special); }
.token-atom { color: var(--sys-color-token-atom); }
.token-keyword { color: var(--sys-color-token-keyword); }
.token-comment { color: var(--sys-color-token-comment); }
.token-meta { color: var(--sys-color-token-meta); }
.token-invalid { color: var(--sys-color-error); }
.token-tag { color: var(--sys-color-token-tag); }
.token-attribute { color: var(--sys-color-token-attribute); }
.token-attribute-value { color: var(--sys-color-token-attribute-value); }
.token-inserted { color: var(--sys-color-token-inserted); }
.token-deleted { color: var(--sys-color-token-deleted); }
.token-heading { color: var(--sys-color-token-variable-special); font-weight: bold; }
.token-link { color: var(--sys-color-token-variable-special); text-decoration: underline; }
.token-strikethrough { text-decoration: line-through; }
.token-strong { font-weight: bold; }
.token-emphasis { font-style: italic; }
`;

export const styles = `${tokens}\n${base}`;
