/** Console：活动流中的事件。发布为普通消息，背压丢弃为警告，校验失败与生命周期失败为错误 */
import type { Activity } from "@bbblank/kernel";
import {
  clock,
  h,
  icon,
  objectPreview,
  replace,
  toolbar,
  toolbarButton,
  toolbarCheckbox,
  toolbarFilter,
  toolbarSeparator,
  toolbarText,
} from "@bbblank/devtools-ui";
import type { DevtoolsModel, PanelView } from "@bbblank/devtools-ui";

type Level = "info" | "warning" | "error";

const levelOf = (a: Activity): Level | undefined => {
  switch (a.kind) {
    case "event":
      return "info";
    case "event-dropped":
      return "warning";
    case "event-invalid":
      return "error";
    case "lifecycle":
      return a.outcome === "error" ? "error" : undefined;
  }
};

/** 用于筛选的纯文本 */
const textOf = (a: Activity) => {
  switch (a.kind) {
    case "event":
      return `${a.publisher} ${a.topic} ${safeJson(a.payload)}`;
    case "event-invalid":
      return `${a.publisher} ${a.topic} ${a.issue}`;
    case "event-dropped":
      return `${a.subscriber} ${a.topic} ${a.reason}`;
    case "lifecycle":
      return `${a.pluginId} ${a.phase} ${a.error?.message ?? ""}`;
  }
};

const safeJson = (v: unknown) => {
  try {
    return JSON.stringify(v) ?? "";
  } catch {
    return "";
  }
};

const body = (a: Activity) => {
  const pub = (id: string) => h("span", { class: "publisher" }, `[${id}] `);
  switch (a.kind) {
    case "event":
      return [pub(a.publisher), h("strong", null, a.topic), " ", objectPreview(a.payload)];
    case "event-invalid":
      return [pub(a.publisher), h("strong", null, a.topic), ` payload 校验失败：${a.issue}`];
    case "event-dropped":
      return [pub(a.subscriber), h("strong", null, a.topic), ` 订阅队列已满，消息被丢弃（${a.reason}）`];
    case "lifecycle":
      return [pub(a.pluginId), `${a.phase} 失败：${a.error?.tag ?? ""} ${a.error?.message ?? ""}`];
  }
};

/** 有警告/错误时显示在 Console 标签上的计数 */
export const issueCount = (activity: ReadonlyArray<Activity>) =>
  activity.filter((a) => levelOf(a) === "warning" || levelOf(a) === "error").length;

export const consolePanel = (model: DevtoolsModel): PanelView => {
  let query = "";
  const levels = new Set<Level>(["info", "warning", "error"]);
  const count = toolbarText("");
  const list = h("div", { class: "console" });
  const level = (l: Level, label: string) =>
    toolbarCheckbox(label, true, (on) => {
      if (on) levels.add(l);
      else levels.delete(l);
      render();
    });

  const el = h(
    "div",
    { class: "panel" },
    toolbar(
      toolbarButton("clear", "清除事件", () => model.clearActivity(["event", "event-invalid", "event-dropped"])),
      toolbarSeparator(),
      toolbarFilter("过滤（插件、事件名、内容）", (v) => {
        query = v.trim().toLowerCase();
        render();
      }),
      level("info", "事件"),
      level("warning", "警告"),
      level("error", "错误"),
      h("div", { class: "toolbar-spacer" }),
      count,
    ),
    list,
  );

  /** 按 seq 复用已渲染的消息节点：新消息到来时，已展开的对象预览保持展开 */
  const rendered = new Map<number, HTMLElement>();
  const messageOf = (a: Activity, l: Level) => {
    let node = rendered.get(a.seq);
    if (!node) {
      node = h(
        "div",
        { class: `console-message ${l}` },
        l === "warning"
          ? icon("warning")
          : l === "error"
            ? icon("cross-circle")
            : h("span", { class: "icon", style: "width:16px;height:16px" }),
        h("span", { class: "console-text" }, body(a)),
        h(
          "span",
          { class: "console-meta" },
          a.kind === "event" ? h("span", { class: "console-source" }, `${a.subscribers} 个订阅者 · `) : null,
          clock(a.at),
        ),
      );
      rendered.set(a.seq, node);
    }
    return node;
  };

  const render = () => {
    // 已滚到底部时，新消息到来后保持在底部（与 Chrome Console 一致）
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 4;
    const live = new Set(model.activity.map((a) => a.seq));
    for (const seq of rendered.keys()) if (!live.has(seq)) rendered.delete(seq);
    const rows = model.activity.flatMap((a) => {
      const l = levelOf(a);
      return l && levels.has(l) && (!query || textOf(a).toLowerCase().includes(query)) ? [messageOf(a, l)] : [];
    });
    count.textContent = `${rows.length} 条消息`;
    replace(list, rows.length ? rows : h("div", { class: "empty" }, "尚无事件。点击信件中的方块试试。"));
    if (atBottom) list.scrollTop = list.scrollHeight;
  };

  return {
    el,
    update: (what) => {
      if (what !== "plugins") render();
    },
  };
};
