/**
 * 源码编辑器：与 Chrome DevTools Sources 面板相同的 CodeMirror 6 配置，可只读（Sources）或可编辑（Playground）。
 * 本模块体积较大，使用方应以 import("@bbblank/devtools-ui/editor") 按需加载。
 * 扩展集合取自 chrome-devtools-frontend 的 ui/components/text_editor/config.ts（baseConfiguration、codeFolding），
 * 着色规则取自 ui/components/code_highlighter/CodeHighlighter.ts（token-* 类，颜色见 devtools-ui 的样式），
 * 编辑器主题取自 ui/components/text_editor/theme.ts。来源：chrome-devtools-frontend@1.0.1705227，BSD-3-Clause。
 */
import { Compartment, EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { EditorView, drawSelection, highlightSpecialChars, hoverTooltip, keymap, lineNumbers } from "@codemirror/view";
import {
  HighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlightSelectionMatches } from "@codemirror/search";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import type { Completion, CompletionContext } from "@codemirror/autocomplete";
import { linter } from "@codemirror/lint";
import { tags as t } from "@lezer/highlight";
import { icon } from "./icons.js";

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
  // 以下取自 theme.ts 的提示框与补全列表
  ".cm-tooltip": { boxShadow: "var(--drop-shadow)", backgroundColor: "var(--sys-color-neutral-container)", border: "none" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    backgroundColor: "var(--sys-color-cdt-base-container)",
    maxHeight: "25em",
    minWidth: "16em",
    fontFamily: "var(--source-code-font-family)",
    fontSize: "var(--source-code-font-size)",
    "& > li": {
      display: "flex",
      justifyContent: "space-between",
      border: "1px solid var(--sys-color-cdt-base-container)",
    },
    "& > li:hover": { backgroundColor: "var(--sys-color-state-hover-on-subtle)" },
    "& > li[aria-selected]": {
      backgroundColor: "var(--sys-color-tonal-container)",
      borderColor: "var(--sys-color-tonal-container)",
      color: "var(--sys-color-on-tonal-container)",
      "&::after": {
        content: '"tab"',
        color: "var(--sys-color-primary-bright)",
        border: "1px solid var(--sys-color-primary-bright)",
        borderRadius: "2px",
        marginLeft: "5px",
        padding: "1px 3px",
        fontSize: "10px",
        lineHeight: "10px",
      },
    },
  },
  ".cm-completionMatchedText": { textDecoration: "none", fontWeight: "bold" },
  ".cm-completionDetail": { fontStyle: "normal", color: "var(--sys-color-token-subtle)" },
  ".cm-tooltip.cm-completionInfo, .cm-tooltip-hover .ts-quickinfo": {
    padding: "4px 8px",
    maxWidth: "40em",
    fontFamily: "var(--source-code-font-family)",
    fontSize: "var(--source-code-font-size)",
    whiteSpace: "pre-wrap",
  },
  ".ts-quickinfo-doc": { fontFamily: "var(--default-font-family)", marginTop: "4px", color: "var(--sys-color-on-surface-subtle)" },
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

/** 语言服务（如 TypeScript）：均以编辑器当前文档调用，位置为文档内偏移量 */
export interface LanguageServiceAdapter {
  diagnostics(doc: string): Promise<
    ReadonlyArray<{ readonly from: number; readonly to: number; readonly severity: "error" | "warning" | "info"; readonly message: string }>
  >;
  completions(
    doc: string,
    pos: number,
  ): Promise<
    ReadonlyArray<{
      readonly label: string;
      /** CodeMirror 的补全类型（function / variable / property / keyword / type / class …），决定图标 */
      readonly type?: string;
      readonly apply?: string;
      readonly boost?: number;
      /** 选中时按需读取的签名与说明 */
      readonly info?: () => Promise<{ readonly signature: string; readonly documentation: string } | null>;
    }>
  >;
  hover(doc: string, pos: number): Promise<{ readonly from: number; readonly to: number; readonly signature: string; readonly documentation: string } | null>;
}

const infoNode = (sig: string, doc: string) => {
  const el = document.createElement("div");
  el.className = "ts-quickinfo";
  el.textContent = sig;
  if (doc) {
    const d = document.createElement("div");
    d.className = "ts-quickinfo-doc";
    d.textContent = doc;
    el.append(d);
  }
  return el;
};

/** 语言服务扩展：诊断（停止输入 300 ms 后）、补全、悬停信息 */
const languageService = (ls: LanguageServiceAdapter): Extension => [
  linter(async (view) => [...(await ls.diagnostics(view.state.doc.toString()))], { delay: 300 }),
  autocompletion({
    override: [
      async (ctx: CompletionContext) => {
        const word = ctx.matchBefore(/[\w$]*/);
        const afterDot = /\.\s*$/.test(ctx.state.sliceDoc(Math.max(0, (word?.from ?? ctx.pos) - 2), word?.from ?? ctx.pos));
        if (!ctx.explicit && !afterDot && (!word || word.from === word.to)) return null;
        const items = await ls.completions(ctx.state.doc.toString(), ctx.pos);
        if (ctx.aborted) return null;
        return {
          from: word?.from ?? ctx.pos,
          validFor: /^[\w$]*$/,
          options: items.map(
            (c): Completion => ({
              label: c.label,
              ...(c.type ? { type: c.type } : {}),
              ...(c.apply ? { apply: c.apply } : {}),
              ...(c.boost !== undefined ? { boost: c.boost } : {}),
              ...(c.info
                ? { info: async () => ((r) => (r ? infoNode(r.signature, r.documentation) : null))(await c.info!()) }
                : {}),
            }),
          ),
        };
      },
    ],
  }),
  keymap.of(completionKeymap),
  hoverTooltip(async (view, pos) => {
    const q = await ls.hover(view.state.doc.toString(), pos);
    return q ? { pos: q.from, end: q.to, above: true, create: () => ({ dom: infoNode(q.signature, q.documentation) }) } : null;
  }),
];

export interface CodeEditorOptions {
  readonly readOnly: boolean;
  readonly onCursor?: (c: Cursor) => void;
  /** 可编辑时文档内容变化（每次事务一次） */
  readonly onChange?: (doc: string) => void;
  /** 额外扩展 */
  readonly extensions?: Extension;
  /** 语言服务：提供后启用诊断、补全与悬停信息（仅可编辑时有意义） */
  readonly languageService?: LanguageServiceAdapter;
}

/** 可编辑时追加的扩展：baseConfiguration 中的 history / indentOnInput / baseKeymap，以及 closeBrackets（Chrome 缺省开启） */
const editing = [
  history(),
  indentOnInput(),
  indentUnit.of("  "),
  closeBrackets(),
  keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
];

export const createCodeEditor = (parent: HTMLElement, opts: CodeEditorOptions) => {
  const onCursor = opts.onCursor ?? (() => {});
  const cursorListener = EditorView.updateListener.of((u) => {
    if (u.docChanged) opts.onChange?.(u.state.doc.toString());
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
    opts.readOnly ? EditorState.readOnly.of(true) : editing,
    cursorListener,
    language.of([]),
    opts.languageService ? languageService(opts.languageService) : [],
    opts.extensions ?? [],
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
    doc: () => view.state.doc.toString(),
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
};
