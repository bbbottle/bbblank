/** 时间、耗时与对象预览的格式化（仿 Chrome Console 的对象展示） */
import { h } from "./dom.js";
import { icon } from "./icons.js";

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export const clock = (at: number) => {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

export const ms = (n: number) =>
  n < 1
    ? `${n.toFixed(2)} ms`
    : n < 1000
      ? `${Math.round(n)} ms`
      : `${(n / 1000).toFixed(2)} s`;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/** 内核错误是带 _tag 的 TaggedError，message 常为空：展示标签与字段 */
export const describeError = (e: unknown): string => {
  if (!isRecord(e)) return String(e);
  const { _tag, message, stack: _stack, ...fields } = e;
  const detail = Object.entries(fields)
    .map(
      ([k, v]) =>
        `${k}: ${Array.isArray(v) ? v.join("、") : typeof v === "object" ? JSON.stringify(v) : String(v)}`,
    )
    .join("；");
  return [
    typeof _tag === "string" ? _tag : "Error",
    typeof message === "string" ? message : "",
    detail,
  ]
    .filter(Boolean)
    .join(" — ");
};

/** 单行预览：{n: 1, note: {…}}；嵌套对象只显示一层 */
const inline = (v: unknown, depth = 0): Node => {
  if (typeof v === "string")
    return h("span", { class: "tok-string" }, JSON.stringify(v));
  if (typeof v === "number" || typeof v === "bigint")
    return h("span", { class: "tok-number" }, String(v));
  if (typeof v === "boolean" || v === null || v === undefined)
    return h("span", { class: "tok-keyword" }, String(v));
  if (typeof v === "function") return h("span", { class: "tok-keyword" }, "ƒ");
  if (!isRecord(v)) return h("span", null, String(v));
  if (depth > 0)
    return h("span", null, Array.isArray(v) ? `Array(${v.length})` : "{…}");
  const entries = Array.isArray(v)
    ? v.map((x, i) => [String(i), x] as const)
    : Object.entries(v);
  const parts = entries
    .slice(0, 5)
    .flatMap(([k, x], i) => [
      i > 0 ? ", " : "",
      ...(Array.isArray(v)
        ? []
        : [h("span", { class: "tok-property" }, k), ": "]),
      inline(x, depth + 1),
    ]);
  return h(
    "span",
    null,
    Array.isArray(v) ? `(${v.length}) [` : "{",
    ...parts,
    entries.length > 5 ? ", …" : "",
    Array.isArray(v) ? "]" : "}",
  );
};

/** 可展开的对象：点击三角展开为逐行 key: value，子对象按需递归 */
export const objectPreview = (v: unknown): Node => {
  if (!isRecord(v)) return inline(v);
  const body = h("div", { class: "object-children" });
  let open = false;
  const toggle = h("span", { class: "object-toggle" }, icon("triangle-right"));
  const head = h(
    "span",
    { class: "object-head", onclick: () => flip() },
    toggle,
    inline(v),
  );
  const flip = () => {
    open = !open;
    toggle.replaceChildren(icon(open ? "triangle-down" : "triangle-right"));
    body.replaceChildren(
      ...(open
        ? Object.entries(v).map(([k, x]) =>
            h(
              "div",
              { class: "object-row" },
              h("span", { class: "tok-property" }, k),
              ": ",
              objectPreview(x),
            ),
          )
        : []),
    );
  };
  return h("span", { class: "object" }, head, body);
};
