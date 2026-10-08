/**
 * Market：宿主登记的插件目录（目前均为内置插件）；未安装的可一键安装，后续接入远程 manifest。
 * 选中条目时右侧打开可关闭的详情窗格（对应 Network 面板选中请求后的详情视图）：表格收窄为只剩「名称」列，
 * 详情标签栏最左侧为关闭按钮；「概览」为目录信息与安装状态，已安装时另有「清单」（依赖、能力、提供的服务）。
 */
import type { PluginCatalogEntry, PluginInfo } from "@bbblank/host-dom";
import {
  dataGrid,
  describeError,
  h,
  icon,
  replace,
  splitWidget,
  statusDot,
  textButton,
  toolbar,
  toolbarButton,
  toolbarText,
} from "@bbblank/devtools-ui";
import type {
  Child,
  Column,
  DevtoolsModel,
  PanelView,
} from "@bbblank/devtools-ui";

type DetailTab = "overview" | "manifest";

/** 详情分区（RequestHeadersView.css 的 details > summary.header 与 .row） */
const section = (
  title: string,
  rows: ReadonlyArray<readonly [string, Child | ReadonlyArray<Child>]>,
) =>
  h(
    "details",
    { class: "details-section", open: true },
    h("summary", { class: "header" }, title),
    rows.map(([k, v]) =>
      h(
        "div",
        { class: "row" },
        h("div", { class: "header-name" }, k),
        h("div", { class: "header-value" }, v),
      ),
    ),
  );

const list = (items: ReadonlyArray<string>): Child | ReadonlyArray<Child> =>
  items.length
    ? h("span", { class: "mono" }, items.join("、"))
    : h("span", { class: "dim" }, "无");

export const marketPanel = (model: DevtoolsModel): PanelView => {
  const grid = dataGrid<PluginCatalogEntry>();
  const summary = toolbarText("");
  const pending = new Set<string>();
  const errors = new Map<string, string>();
  /** 详情窗格中显示的条目；undefined 表示窗格关闭 */
  let selected: string | undefined;
  let tab: DetailTab = "overview";
  let sized = false;

  const details = h("div", { class: "market-details" });
  const split = splitWidget();
  split.sidebarSide = "right";
  split.main.append(grid);
  split.sidebar.append(details);
  split.sidebarShown = false;
  const el = h("div", { class: "panel" }, toolbar(summary), split);

  grid.onPick = (id) => {
    if (!selected && !sized) {
      split.sidebarWidth = Math.round(split.clientWidth * 0.85);
      sized = true;
    }
    if (selected !== id) tab = "overview";
    selected = id;
    render();
  };

  const closeDetails = () => {
    selected = undefined;
    render();
  };

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

  /** 状态：已安装显示状态，未安装显示「安装」按钮（及失败原因） */
  const status = (
    c: PluginCatalogEntry,
    withReason: boolean,
  ): Child | ReadonlyArray<Child> => {
    const installed = model.byId(c.id);
    if (installed)
      return h(
        "span",
        { class: "dim" },
        statusDot(installed.status),
        ` 已安装 · ${installed.status}`,
      );
    const error = errors.get(c.id);
    return [
      textButton(
        pending.has(c.id) ? "安装中…" : "安装",
        () => void install(c.id),
        { primary: true, disabled: pending.has(c.id) },
      ),
      error
        ? h(
            "span",
            { class: "error-text", title: error },
            withReason ? ` 失败：${error}` : " 失败",
          )
        : null,
    ];
  };

  const overview = (c: PluginCatalogEntry, info: PluginInfo | undefined) => [
    section("常规", [
      ["名称", c.name],
      ["ID", h("span", { class: "mono" }, c.id)],
      ["版本", h("span", { class: "mono" }, c.version)],
      ["状态", status(c, true)],
      ["描述", c.description ?? h("span", { class: "dim" }, "无")],
    ]),
    info
      ? section("运行", [
          ["类型", h("span", { class: "mono" }, info.kind ?? "未知")],
          ["运行版本", h("span", { class: "mono" }, info.version ?? "未知")],
          ["重启次数", String(info.restarts)],
          [
            "最近错误",
            info.lastError
              ? h(
                  "span",
                  { class: "error-text" },
                  `${info.lastError.tag}: ${info.lastError.message}`,
                )
              : h("span", { class: "dim" }, "无"),
          ],
        ])
      : null,
  ];

  const manifest = (info: PluginInfo) => [
    section(
      "依赖",
      info.dependencies.length
        ? info.dependencies.map(
            (d) => [d.id, h("span", { class: "mono" }, d.range)] as const,
          )
        : [["依赖", list([])]],
    ),
    section("能力", [["申请", list(info.capabilities)]]),
    section("服务", [["提供", list(info.provides)]]),
  ];

  const renderDetails = () => {
    const c = selected
      ? model.pm.catalog().find((e) => e.id === selected)
      : undefined;
    if (!c) {
      selected = undefined;
      split.sidebarShown = false;
      return;
    }
    split.sidebarShown = true;
    const info = model.byId(c.id);
    if (!info && tab === "manifest") tab = "overview";
    const tabs: ReadonlyArray<readonly [DetailTab, string]> = info
      ? [
          ["overview", "概览"],
          ["manifest", "清单"],
        ]
      : [["overview", "概览"]];
    const close = toolbarButton("cross", "关闭", closeDetails);
    close.classList.add("tabbed-pane-close-details");
    replace(
      details,
      h(
        "div",
        { class: "tabbed-pane-header" },
        close,
        h(
          "div",
          { class: "tabbed-pane-header-tabs", role: "tablist" },
          tabs.map(([key, title]) =>
            h(
              "button",
              {
                class: `tabbed-pane-header-tab${key === tab ? " selected" : ""}`,
                role: "tab",
                "aria-selected": String(key === tab),
                onclick: () => {
                  tab = key;
                  renderDetails();
                },
              },
              title,
            ),
          ),
        ),
      ),
      h(
        "div",
        { class: "market-details-body" },
        tab === "manifest" && info ? manifest(info) : overview(c, info),
      ),
    );
  };

  const render = () => {
    const catalog = model.pm.catalog();
    const available = catalog.filter((c) => !model.byId(c.id));
    summary.textContent = `内置 ${catalog.length} 个插件 · ${available.length} 个可安装`;
    const name: Column<PluginCatalogEntry> = {
      id: "name",
      title: "名称",
      width: "18%",
      cell: (c) =>
        h("span", { class: "market-name" }, icon("extension"), c.name),
    };
    const columns: ReadonlyArray<Column<PluginCatalogEntry>> = selected
      ? // 详情打开时表格只保留「名称」列（同 Network 面板）
        [{ ...name, width: undefined }]
      : [
          name,
          // 状态 / 安装按钮放在第 2 列：窄屏横向滚动时无需滚到最右侧即可操作
          {
            id: "action",
            title: "状态",
            width: "140px",
            cell: (c) => status(c, false),
          },
          { id: "id", title: "ID", width: "14%", cell: (c) => c.id },
          { id: "version", title: "版本", width: "8%", cell: (c) => c.version },
          {
            id: "description",
            title: "描述",
            cell: (c) =>
              h("span", { title: c.description }, c.description ?? ""),
          },
        ];
    // 未安装的排在前面
    const rows = [...available, ...catalog.filter((c) => model.byId(c.id))];
    grid.classList.toggle("narrow", !!selected);
    grid.update(columns, rows, (c) => c.id, {
      empty: "目录为空",
      ...(selected ? { selected } : {}),
    });
    renderDetails();
  };

  return {
    el,
    update: (what) => {
      if (what !== "activity") render();
    },
  };
};
