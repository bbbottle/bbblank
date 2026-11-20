/** Console：活动流中的事件。发布为普通消息，背压丢弃为警告，校验失败与生命周期失败为错误 */
import type { Activity } from "@bbblank/kernel";
import {
  clock,
  describeError,
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
import { evaluate, sdkGlobals } from "./eval";

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
  const messages = h("div", { class: "console-messages" });

  // ---------- REPL（Chrome Console 风格的命令行） ----------
  const globals: Record<string, unknown> = {
    ...sdkGlobals(),
    pm: model.pm,
    kernel: (globalThis as { bbking?: unknown }).bbking,
  };
  /** 已求值的输入回显与结果节点；与活动流一起渲染在 list 中 */
  const repl: Array<HTMLElement> = [];
  const history: Array<string> = [];
  let historyIndex = 0;

  const input = h("textarea", {
    rows: "1",
    spellcheck: "false",
    autocapitalize: "off",
  });
  const grow = () => {
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  };
  input.oninput = grow;

  const echoRow = (code: string) =>
    h("div", { class: "console-message repl-input" }, icon("chevron-right", "console-prompt-icon"), h("span", { class: "console-text" }, code));
  const resultRow = (v: unknown) =>
    h("div", { class: "console-message repl-result" }, icon("chevron-left-dot", "console-result-icon"), h("span", { class: "console-text" }, objectPreview(v)));
  const errorRow = (e: unknown) =>
    h("div", { class: "console-message error repl-error" }, icon("cross-circle"), h("span", { class: "console-text" }, describeError(e)));

  const run = async (code: string) => {
    try {
      const v = await evaluate(code, globals);
      if (v !== undefined) repl.push(resultRow(v));
    } catch (e) {
      repl.push(errorRow(e));
    }
    render();
  };

  const submit = () => {
    const code = input.value;
    if (!code.trim()) return;
    history.push(code);
    historyIndex = history.length;
    input.value = "";
    grow();
    repl.push(echoRow(code));
    render();
    void run(code);
  };

  input.onkeydown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === "ArrowUp" && !e.shiftKey && !input.value.includes("\n")) {
      if (history.length && historyIndex > 0) {
        historyIndex -= 1;
        input.value = history[historyIndex];
        input.setSelectionRange(input.value.length, input.value.length);
        grow();
        e.preventDefault();
      }
    } else if (e.key === "ArrowDown" && !e.shiftKey && !input.value.includes("\n")) {
      if (historyIndex < history.length) {
        historyIndex += 1;
        input.value = historyIndex < history.length ? history[historyIndex] : "";
        input.setSelectionRange(input.value.length, input.value.length);
        grow();
        e.preventDefault();
      }
    }
  };

  const inputLine = h(
    "div",
    { class: "console-input", onclick: () => input.focus() },
    icon("chevron-right", "console-prompt-icon"),
    input,
  );
  list.append(messages, inputLine);

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
      toolbarButton("clear", "清除事件", () => {
        model.clearActivity(["event", "event-invalid", "event-dropped"]);
        repl.length = 0;
      }),
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
    replace(messages, [...rows, ...repl]);
    if (atBottom) list.scrollTop = list.scrollHeight;
  };

  return {
    el,
    update: (what) => {
      if (what !== "plugins") render();
    },
  };
};
