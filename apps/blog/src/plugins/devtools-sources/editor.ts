/**
 * 只读源码视图：与 Chrome DevTools Sources 面板相同的 CodeMirror 6 配置。
 * 扩展集合取自 chrome-devtools-frontend 的 ui/components/text_editor/config.ts（baseConfiguration、codeFolding），
 * 着色规则取自 ui/components/code_highlighter/CodeHighlighter.ts（token-* 类，颜色见 devtools-ui 的样式），
 * 编辑器主题取自 ui/components/text_editor/theme.ts。来源：chrome-devtools-frontend@1.0.1705227，BSD-3-Clause。
 */
import { Compartment, EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { EditorView, drawSelection, highlightSpecialChars, keymap, lineNumbers } from "@codemirror/view";
import {
  HighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlightSelectionMatches } from "@codemirror/search";
import { tags as t } from "@lezer/highlight";
import { icon } from "@bbblank/devtools-ui";

const highlightStyle = HighlightStyle.define([
  { tag: t.variableName, class: "token-variable" },
  { tag: t.definition(t.variableName), class: "token-definition" },
  { tag: t.propertyName, class: "token-property" },
  { tag: [t.typeName, t.className, t.namespace, t.macroName], class: "token-type" },
  { tag: [t.special(t.name), t.constant(t.className)], class: "token-variable-special" },
  { tag: t.standard(t.variableName), class: "token-builtin" },
  { tag: [t.number, t.literal, t.unit], class: "token-number" },
  { tag: t.string, class: "token-string" },
  { tag: [t.special(t.string), t.regexp, t.escape], class: "token-string-special" },
  { tag: [t.atom, t.labelName, t.bool], class: "token-atom" },
  { tag: t.keyword, class: "token-keyword" },
  { tag: [t.comment, t.quote], class: "token-comment" },
  { tag: t.meta, class: "token-meta" },
  { tag: t.invalid, class: "token-invalid" },
  { tag: t.tagName, class: "token-tag" },
  { tag: t.attributeName, class: "token-attribute" },
  { tag: t.attributeValue, class: "token-attribute-value" },
  { tag: t.inserted, class: "token-inserted" },
  { tag: t.deleted, class: "token-deleted" },
  { tag: t.heading, class: "token-heading" },
  { tag: t.link, class: "token-link" },
  { tag: t.strikethrough, class: "token-strikethrough" },
  { tag: t.strong, class: "token-strong" },
  { tag: t.emphasis, class: "token-emphasis" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", cursor: "auto", "&.cm-focused": { outline: "none" } },
  ".cm-scroller": {
    lineHeight: "1.4em",
    fontFamily: "var(--source-code-font-family)",
    fontSize: "var(--source-code-font-size)",
  },
  ".cm-content": { lineHeight: "1.4em" },
  ".cm-selectionMatch": { backgroundColor: "var(--sys-color-yellow-container)" },
  ".cm-cursor": { borderLeft: "1px solid var(--sys-color-inverse-surface)" },
  "&.cm-readonly .cm-cursor": { display: "none" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    background: "var(--sys-color-tonal-container)",
  },
  ".cm-line::selection": { color: "currentColor" },
  ".cm-selectionBackground": { background: "var(--sys-color-neutral-container)" },
  ".cm-gutters": {
    borderRight: "none",
    whiteSpace: "nowrap",
    backgroundColor: "var(--sys-color-cdt-base-container)",
  },
  ".cm-gutters .cm-foldGutterElement": { cursor: "pointer", opacity: "0%", transition: "opacity 0.2s" },
  ".cm-gutters .cm-foldGutterElement-folded, .cm-gutters:hover .cm-foldGutterElement": { opacity: "100%" },
  ".cm-foldGutterElement.icon": { width: "14px", height: "14px", verticalAlign: "middle" },
  ".cm-lineNumbers": { overflow: "visible", minWidth: "40px" },
  ".cm-lineNumbers .cm-gutterElement": { color: "var(--sys-color-outline)", padding: "0 3px 0 9px" },
  ".cm-foldPlaceholder": { background: "transparent", border: "none", color: "var(--sys-color-token-subtle)" },
  ".cm-matchingBracket, .cm-nonmatchingBracket": { background: "transparent", borderBottom: "none" },
  "&:focus-within .cm-matchingBracket": {
    color: "inherit",
    backgroundColor: "var(--sys-color-surface-variant)",
    borderBottom: "1px solid var(--sys-color-outline)",
  },
  "&:focus-within .cm-nonmatchingBracket": {
    backgroundColor: "var(--sys-color-error-container)",
    borderBottom: "1px solid var(--sys-color-error)",
  },
});

/** Chrome 的 codeFolding：折叠标记用 triangle-down / triangle-right 图标 */
const folding = [
  foldGutter({
    markerDOM: (open) => {
      const el = icon(open ? "triangle-down" : "triangle-right");
      el.classList.add("cm-foldGutterElement");
      if (!open) el.classList.add("cm-foldGutterElement-folded");
      return el;
    },
  }),
  keymap.of(foldKeymap),
];

/** 按扩展名选择语言（对应 CodeHighlighter.languageFromMIME），解析器按需加载 */
const languageFor = async (path: string): Promise<Extension> => {
  const ext = path.slice(path.lastIndexOf(".") + 1);
  switch (ext) {
    case "ts":
    case "mts":
      return (await import("@codemirror/lang-javascript")).javascript({ typescript: true });
    case "tsx":
      return (await import("@codemirror/lang-javascript")).javascript({ typescript: true, jsx: true });
    case "js":
    case "mjs":
    case "jsx":
      return (await import("@codemirror/lang-javascript")).javascript({ jsx: true });
    case "css":
      return (await import("@codemirror/lang-css")).css();
    case "html":
    case "svg":
      return (await import("@codemirror/lang-html")).html();
    case "json":
      return (await import("@codemirror/lang-json")).json();
    case "md":
      return (await import("@codemirror/lang-markdown")).markdown();
    default:
      return [];
  }
};

export interface Cursor {
  readonly line: number;
  readonly column: number;
  readonly selected: number;
}

export const createEditor = (parent: HTMLElement, onCursor: (c: Cursor) => void) => {
  const cursorListener = EditorView.updateListener.of((u) => {
    if (!u.selectionSet && !u.docChanged) return;
    const sel = u.state.selection.main;
    const line = u.state.doc.lineAt(sel.head);
    onCursor({ line: line.number, column: sel.head - line.from + 1, selected: sel.to - sel.from });
  });
  const language = new Compartment();
  const base = [
    theme,
    highlightSpecialChars(),
    highlightSelectionMatches(),
    drawSelection(),
    syntaxHighlighting(highlightStyle),
    bracketMatching(),
    lineNumbers(),
    folding,
    EditorState.readOnly.of(true),
    cursorListener,
    language.of([]),
  ];
  // root：编辑器位于 devtools 的 Shadow Root 内，CodeMirror 的样式须挂到同一 root
  const view = new EditorView({ parent, root: parent.getRootNode() as ShadowRoot | Document });
  /** 打开期间切换文件时，丢弃已过期的语言加载结果 */
  let token = 0;

  return {
    show: async (doc: string, path: string) => {
      const mine = ++token;
      // 先显示纯文本，解析器加载完成后再启用语法（不重建 state，保留滚动位置与选区）
      view.setState(EditorState.create({ doc, extensions: base }));
      onCursor({ line: 1, column: 1, selected: 0 });
      const lang = await languageFor(path);
      if (mine === token) view.dispatch({ effects: language.reconfigure(lang) });
    },
    destroy: () => view.destroy(),
  };
};
