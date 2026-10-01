/** Network：活动流中的生命周期阶段（load / setup / stop），按时间画出瀑布图 */
import type { Activity } from "@bbblank/kernel";
import { dataGrid, toolbar, toolbarButton, toolbarCheckbox, toolbarFilter, toolbarSeparator } from "../ui/components";
import type { Column } from "../ui/components";
import { h, replace } from "../ui/dom";
import { ms } from "../ui/format";
import { icon } from "../ui/icons";
import type { PanelFactory } from "./panel";

type Lifecycle = Extract<Activity, { kind: "lifecycle" }>;

const PHASE = { load: "加载", setup: "启用", stop: "停止" } as const;

export const networkPanel: PanelFactory = (model) => {
  let query = "";
  let showStop = true;
  let selected: string | undefined;
  const grid = dataGrid<Lifecycle>();
  const status = h("div", { class: "status-bar" });
  grid.onPick = (k) => {
    selected = k;
    render();
  };

  const el = h(
    "div",
    { class: "panel" },
    toolbar(
      toolbarButton("clear", "清除记录", () => model.clearActivity(["lifecycle"])),
      toolbarSeparator(),
      toolbarFilter("过滤插件", (v) => {
        query = v.trim().toLowerCase();
        render();
      }),
      toolbarCheckbox("显示停止", true, (on) => {
        showStop = on;
        render();
      }),
    ),
    grid,
    status,
  );

  const render = () => {
    const rows = model.activity.filter(
      (a): a is Lifecycle =>
        a.kind === "lifecycle" && (showStop || a.phase !== "stop") && (!query || a.pluginId.toLowerCase().includes(query)),
    );
    const t0 = Math.min(...rows.map((r) => r.at));
    const t1 = Math.max(...rows.map((r) => r.at + r.durationMs));
    const span = Math.max(t1 - t0, 1);

    const columns: ReadonlyArray<Column<Lifecycle>> = [
      { id: "name", title: "名称", width: "18%", cell: (r) => h("span", { class: "grid-name" }, icon("extension"), r.pluginId) },
      { id: "phase", title: "阶段", width: "9%", cell: (r) => PHASE[r.phase] },
      {
        id: "status",
        title: "状态",
        width: "9%",
        cell: (r) => (r.outcome === "ok" ? h("span", null, "完成") : h("span", { class: "error-text" }, r.error?.tag ?? "失败")),
      },
      { id: "start", title: "开始", width: "10%", align: "end", cell: (r) => ms(r.at - t0) },
      { id: "time", title: "时间", width: "10%", align: "end", cell: (r) => ms(r.durationMs) },
      {
        id: "waterfall",
        title: "瀑布",
        cell: (r) =>
          h(
            "div",
            { class: "waterfall", title: `${PHASE[r.phase]} ${ms(r.durationMs)}` },
            h("div", {
              class: `waterfall-bar phase-${r.phase}${r.outcome === "error" ? " error" : ""}`,
              style: `left: ${((r.at - t0) / span) * 100}%; width: ${(r.durationMs / span) * 100}%`,
            }),
          ),
      },
    ];
    grid.update(columns, rows, (r) => String(r.seq), {
      ...(selected ? { selected } : {}),
      rowClass: (r) => (r.outcome === "error" ? "error" : ""),
      empty: "尚无记录。安装或启停插件后，这里会显示各阶段耗时。",
    });

    const loads = rows.filter((r) => r.phase === "load");
    const setups = rows.filter((r) => r.phase === "setup");
    const total = (xs: ReadonlyArray<Lifecycle>) => ms(xs.reduce((s, r) => s + r.durationMs, 0));
    replace(
      status,
      h("span", null, `${rows.length} 条记录`),
      h("span", null, `加载 ${loads.length} 次，合计 ${total(loads)}`),
      h("span", null, `启用 ${setups.length} 次，合计 ${total(setups)}`),
      rows.length ? h("span", null, `跨度 ${ms(t1 - t0)}`) : null,
    );
  };

  return {
    id: "network",
    title: "Network",
    el,
    update: (what) => {
      if (what !== "plugins") render();
    },
  };
};
