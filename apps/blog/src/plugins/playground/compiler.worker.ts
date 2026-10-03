/**
 * TypeScript Worker（经典 Worker）：以 importScripts 加载 TypeScript 6.0.3 的 typescript.js（全局变量 ts）。
 * - compile：逐文件 transpileModule（去除类型，不做类型检查）；import / export / import() 的模块路径替换为占位符
 *   __BBPG_<n>__，原始路径随结果返回，由主线程链接为 Blob URL。
 * - 语言服务：内存文件系统 = 草稿（按版本增量更新）+ 类型文件包（只读）；提供诊断、补全、补全详情与悬停信息。
 *
 * 本文件须为经典脚本：不得出现 import / export（含 import type，否则会留下 export {}，经典 Worker 无法解析），
 * 类型一律经 import("…") 类型表达式引用。
 */
type TS = typeof import("typescript-browser");
type TSNode = import("typescript-browser").Node;
type TSSourceFile = import("typescript-browser").SourceFile;
type TSStringLiteral = import("typescript-browser").StringLiteral;
type TSTransformerFactory = import("typescript-browser").TransformerFactory<TSSourceFile>;
type TSLanguageService = import("typescript-browser").LanguageService;
type TSDiagnostic = import("typescript-browser").Diagnostic;
type TSSymbolDisplayPart = import("typescript-browser").SymbolDisplayPart;
type WorkerRequest = import("./compiler").WorkerRequest;
type WorkerResponse = import("./compiler").WorkerResponse;
type CompiledFile = import("./compiler").CompiledFile;
type LsDiagnostic = import("./compiler").LsDiagnostic;
type TypePack = import("./compiler").TypePack;

declare const ts: TS;
declare function importScripts(...urls: Array<string>): void;

// ---------- 编译 ----------

const placeholder = (i: number) => `__BBPG_${i}__`;

const rewriter =
  (imports: Array<string>): TSTransformerFactory =>
  (ctx) =>
  (sf) => {
    const f = ctx.factory;
    const swap = (lit: TSStringLiteral) => f.createStringLiteral(placeholder(imports.push(lit.text) - 1));
    const visit = (n: TSNode): TSNode => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier))
        return f.updateImportDeclaration(n, n.modifiers, n.importClause, swap(n.moduleSpecifier), n.attributes);
      if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier))
        return f.updateExportDeclaration(n, n.modifiers, n.isTypeOnly, n.exportClause, swap(n.moduleSpecifier), n.attributes);
      if (
        ts.isCallExpression(n) &&
        n.expression.kind === ts.SyntaxKind.ImportKeyword &&
        n.arguments[0] &&
        ts.isStringLiteral(n.arguments[0])
      )
        return f.updateCallExpression(n, n.expression, n.typeArguments, [swap(n.arguments[0]), ...n.arguments.slice(1)]);
      return ts.visitEachChild(n, visit, ctx);
    };
    return ts.visitNode(sf, visit) as TSSourceFile;
  };

const compile = (path: string, code: string): CompiledFile => {
  const imports: Array<string> = [];
  const out = ts.transpileModule(code, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    transformers: { after: [rewriter(imports)] },
  });
  return {
    path,
    js: out.outputText,
    imports,
    diagnostics: (out.diagnostics ?? []).map((d) => ({
      from: d.start ?? 0,
      to: (d.start ?? 0) + (d.length ?? 0),
      message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    })),
  };
};

// ---------- 语言服务 ----------

/** 草稿使用仓库相对路径（apps/blog/...），虚拟文件系统以 /repo 为根 */
const ROOT = "/repo/";
const vpath = (path: string) => ROOT + path;

let pack: TypePack | undefined;
let dirs: Set<string> | undefined;
const drafts = new Map<string, { text: string; version: number }>();
let service: Promise<TSLanguageService> | undefined;

/** 首次请求时读取类型文件包并创建语言服务；并发的首批请求共用同一次初始化 */
const ensureService = (typesUrl: string) => (service ??= createService(typesUrl));

const createService = async (typesUrl: string) => {
  const res = await fetch(typesUrl);
  if (!res.ok) throw new Error(`类型文件包请求返回 ${res.status}`);
  pack = (await res.json()) as TypePack;
  dirs = new Set<string>();
  for (const f of Object.keys(pack.files)) for (let d = f; (d = d.slice(0, d.lastIndexOf("/"))); ) dirs.add(d);
  const text = (f: string) => drafts.get(f)?.text ?? pack!.files[f];
  return ts.createLanguageService(
    {
      getCompilationSettings: () => ({
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
        types: [],
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        isolatedModules: true,
        allowImportingTsExtensions: true,
        jsx: ts.JsxEmit.ReactJSX,
        paths: pack!.paths as Record<string, Array<string>>,
      }),
      getScriptFileNames: () => [...drafts.keys()],
      getScriptVersion: (f) => String(drafts.get(f)?.version ?? 0),
      getScriptSnapshot: (f) => {
        const t = text(f);
        return t === undefined ? undefined : ts.ScriptSnapshot.fromString(t);
      },
      getCurrentDirectory: () => "/repo",
      getDefaultLibFileName: (o) => `/lib/${ts.getDefaultLibFileName(o)}`,
      fileExists: (f) => text(f) !== undefined,
      readFile: (f) => text(f),
      directoryExists: (d) => dirs!.has(d.replace(/\/$/, "")) || [...drafts.keys()].some((f) => f.startsWith(`${d}/`)),
      getDirectories: () => [],
    },
    ts.createDocumentRegistry(),
  );
};

/** 同步草稿：内容变化才增加版本；已删除的草稿移出 */
const sync = (files: Readonly<Record<string, string>>) => {
  const keep = new Set(Object.keys(files).map(vpath));
  for (const f of drafts.keys()) if (!keep.has(f)) drafts.delete(f);
  for (const [p, t] of Object.entries(files)) {
    const f = vpath(p);
    const cur = drafts.get(f);
    if (!cur) drafts.set(f, { text: t, version: 1 });
    else if (cur.text !== t) drafts.set(f, { text: t, version: cur.version + 1 });
  }
};

const partsText = (parts: ReadonlyArray<TSSymbolDisplayPart> | undefined) => (parts ?? []).map((p) => p.text).join("");

const toDiagnostic = (d: TSDiagnostic): LsDiagnostic => ({
  from: d.start ?? 0,
  to: (d.start ?? 0) + (d.length ?? 0),
  severity: d.category === ts.DiagnosticCategory.Error ? "error" : d.category === ts.DiagnosticCategory.Warning ? "warning" : "info",
  message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
  code: d.code,
});

// ---------- 消息 ----------

let tsReady: string | undefined;

const handle = async (req: WorkerRequest): Promise<unknown> => {
  if (tsReady !== req.tsUrl) {
    importScripts(req.tsUrl);
    tsReady = req.tsUrl;
  }
  switch (req.method) {
    case "compile":
      return { version: ts.version, files: req.files.map((f) => compile(f.path, f.code)) };
    case "diagnostics": {
      const s = await ensureService(req.typesUrl);
      sync(req.files);
      const f = vpath(req.path);
      return [...s.getSyntacticDiagnostics(f), ...s.getSemanticDiagnostics(f)].map(toDiagnostic);
    }
    case "completions": {
      const s = await ensureService(req.typesUrl);
      sync(req.files);
      const info = s.getCompletionsAtPosition(vpath(req.path), req.pos, {
        includeCompletionsWithInsertText: true,
        includeCompletionsForModuleExports: false,
      });
      return (info?.entries ?? []).slice(0, 2000).map((e) => ({
        name: e.name,
        kind: e.kind,
        sortText: e.sortText,
        insertText: e.insertText,
        source: e.source,
      }));
    }
    case "completionDetails": {
      const s = await ensureService(req.typesUrl);
      const d = s.getCompletionEntryDetails(vpath(req.path), req.pos, req.name, {}, req.source, {}, undefined);
      return d ? { signature: partsText(d.displayParts), documentation: partsText(d.documentation) } : null;
    }
    case "quickInfo": {
      const s = await ensureService(req.typesUrl);
      sync(req.files);
      const q = s.getQuickInfoAtPosition(vpath(req.path), req.pos);
      return q
        ? {
            from: q.textSpan.start,
            to: q.textSpan.start + q.textSpan.length,
            signature: partsText(q.displayParts),
            documentation: partsText(q.documentation),
          }
        : null;
    }
  }
};

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  handle(req).then(
    (result) => self.postMessage({ id: req.id, result } satisfies WorkerResponse),
    (err: unknown) => self.postMessage({ id: req.id, error: err instanceof Error ? err.message : String(err) } satisfies WorkerResponse),
  );
};
