/** Application：安装记录（实时）、审计日志与事件统计（来自诊断导出，按需刷新） */
import type { Diagnostics } from "@bbblank/kernel";
import type { PluginInfo } from "@bbblank/host-dom";
import {
  clock,
  dataGrid,
  h,
  replace,
  statusDot,
  toolbar,
  toolbarButton,
  toolbarText,
} from "@bbblank/devtools-ui";
import type { Column, DevtoolsModel, PanelView } from "@bbblank/devtools-ui";

type View = "installs" | "audit" | "events";

const VIEWS: ReadonlyArray<readonly [View, string]> = [
  ["installs", "安装记录"],
  ["audit", "审计日志"],
  ["events", "事件统计"],
];

type AuditRow = Diagnostics["audit"][number];
type DeadLetterRow = Diagnostics["events"]["deadLetters"][number];

export const applicationPanel = (model: DevtoolsModel): PanelView => {
  let view: View = "installs";
  let diag: Diagnostics | undefined;
  let loadError: string | undefined;
  const nav = h("div", { class: "app-nav" });
  const content = h("div", { class: "app-content" });
  const el = h("div", { class: "panel" }, h("div", { class: "app-layout" }, nav, content));

  const refresh = async () => {
    try {
      diag = await model.pm.diagnostics();
      loadError = undefined;
    } catch (e) {
      loadError = String(e);
    }
    render();
  };

  const installs = () => {
    const grid = dataGrid<PluginInfo>();
    const columns: ReadonlyArray<Column<PluginInfo>> = [
      { id: "id", title: "ID", width: "20%", cell: (p) => p.id },
      { id: "status", title: "状态", width: "16%", cell: (p) => [statusDot(p.status), " ", p.status] },
      { id: "version", title: "版本", width: "12%", cell: (p) => p.version ?? "未知" },
      { id: "kind", title: "类型", width: "10%", cell: (p) => p.kind ?? "未知" },
      { id: "restarts", title: "重启", width: "8%", align: "end", cell: (p) => String(p.restarts) },
      { id: "error", title: "最近错误", cell: (p) => (p.lastError ? h("span", { class: "error-text" }, p.lastError.message) : "") },
    ];
    grid.update(columns, model.plugins, (p) => p.id, { empty: "没有已安装的插件" });
    return [toolbar(toolbarText(`期望态记录 ${model.plugins.length} 条（InstallStore）`)), grid];
  };

  const audit = () => {
    const grid = dataGrid<AuditRow>();
    const rows = [...(diag?.audit ?? [])].reverse();
    const columns: ReadonlyArray<Column<AuditRow>> = [
      { id: "at", title: "时间", width: "14%", cell: (r) => clock(r.at) },
      { id: "plugin", title: "插件", width: "16%", cell: (r) => r.pluginId },
      { id: "action", title: "操作", width: "28%", cell: (r) => r.action },
      { id: "target", title: "目标", cell: (r) => r.target ?? "" },
      {
        id: "outcome",
        title: "结果",
        width: "10%",
        cell: (r) => (r.outcome === "allowed" ? h("span", { class: "ok-text" }, "允许") : h("span", { class: "error-text" }, "拒绝")),
      },
    ];
    grid.update(columns, rows, (r) => `${r.at}-${r.pluginId}-${r.action}-${r.target ?? ""}`, {
      rowClass: (r) => (r.outcome === "denied" ? "error" : ""),
      empty: diag ? "没有审计记录" : "加载中…",
    });
    return [
      toolbar(toolbarButton("refresh", "刷新", () => void refresh()), toolbarText(`最近 ${rows.length} 条，新记录在前`)),
      grid,
    ];
  };

  const events = () => {
    const grid = dataGrid<DeadLetterRow>();
    const columns: ReadonlyArray<Column<DeadLetterRow>> = [
      { id: "at", title: "时间", width: "16%", cell: (r) => clock(r.at) },
      { id: "topic", title: "事件", width: "34%", cell: (r) => r.topic },
      { id: "subscriber", title: "订阅者", width: "24%", cell: (r) => r.subscriber },
      { id: "reason", title: "原因", cell: (r) => r.reason },
    ];
    grid.update(columns, diag?.events.deadLetters ?? [], (r) => `${r.at}-${r.topic}-${r.subscriber}`, {
      empty: diag ? "没有死信" : "加载中…",
    });
    return [
      toolbar(
        toolbarButton("refresh", "刷新", () => void refresh()),
        toolbarText(diag ? `已发布 ${diag.events.published} 条 · 已丢弃 ${diag.events.dropped} 条 · 死信如下` : "加载中…"),
      ),
      grid,
    ];
  };

  const render = () => {
    replace(
      nav,
      h("div", { class: "app-nav-heading" }, "内核"),
      VIEWS.map(([v, label]) =>
        h(
          "div",
          {
            class: `app-nav-item${v === view ? " selected" : ""}`,
            onclick: () => {
              view = v;
              if (v !== "installs") void refresh();
              render();
            },
          },
          label,
        ),
      ),
    );
    replace(
      content,
      loadError ? h("div", { class: "banner error" }, loadError) : null,
      view === "installs" ? installs() : view === "audit" ? audit() : events(),
    );
  };

  return {
    el,
    update: (what) => {
      if (what === "shown" && view !== "installs") void refresh();
      if (what !== "activity" || view === "installs") render();
    },
  };
};
