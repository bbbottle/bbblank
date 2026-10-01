/** Market：宿主登记的插件目录（目前均为内置插件）；未安装的可一键安装，后续接入远程 manifest */
import type { PluginCatalogEntry } from "@bbblank/host-dom";
import { dataGrid, textButton, toolbar, toolbarText } from "../ui/components";
import type { Column } from "../ui/components";
import { h } from "../ui/dom";
import { describeError } from "../ui/format";
import { icon } from "../ui/icons";
import { statusDot } from "./plugins";
import type { PanelFactory } from "./panel";

export const marketPanel: PanelFactory = (model) => {
  const grid = dataGrid<PluginCatalogEntry>();
  const summary = toolbarText("");
  const pending = new Set<string>();
  const errors = new Map<string, string>();
  const el = h("div", { class: "panel" }, toolbar(summary), grid);

  const install = async (id: PluginCatalogEntry["id"]) => {
    pending.add(id);
    errors.delete(id);
    render();
    try {
      await model.pm.install(id);
    } catch (e) {
      errors.set(id, describeError(e));
    } finally {
      pending.delete(id);
      render();
    }
  };

  const render = () => {
    const catalog = model.pm.catalog();
    const available = catalog.filter((c) => !model.byId(c.id));
    summary.textContent = `内置目录 ${catalog.length} 个插件 · ${available.length} 个可安装`;
    const columns: ReadonlyArray<Column<PluginCatalogEntry>> = [
      {
        id: "name",
        title: "名称",
        width: "18%",
        cell: (c) => h("span", { class: "market-name" }, icon("extension"), c.name),
      },
      { id: "id", title: "ID", width: "14%", cell: (c) => c.id },
      { id: "version", title: "版本", width: "8%", cell: (c) => c.version },
      { id: "description", title: "描述", cell: (c) => h("span", { title: c.description }, c.description ?? "") },
      {
        id: "action",
        title: "",
        width: "160px",
        cell: (c) => {
          const installed = model.byId(c.id);
          if (installed) return h("span", { class: "dim" }, statusDot(installed.status), ` 已安装 · ${installed.status}`);
          const error = errors.get(c.id);
          return [
            textButton(pending.has(c.id) ? "安装中…" : "安装", () => void install(c.id), {
              primary: true,
              disabled: pending.has(c.id),
            }),
            error ? h("span", { class: "error-text", title: error }, " 失败") : null,
          ];
        },
      },
    ];
    // 未安装的排在前面
    const rows = [...available, ...catalog.filter((c) => model.byId(c.id))];
    grid.update(columns, rows, (c) => c.id, { empty: "目录为空" });
  };

  return {
    id: "market",
    title: "Market",
    el,
    update: (what) => {
      if (what !== "activity") render();
    },
  };
};
