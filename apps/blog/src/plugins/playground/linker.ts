/**
 * 链接：把编译结果中的模块路径占位符解析为 Blob URL，并加载入口模块。
 * - 共享模块（./modules）：生成一次性的转发模块，从 globalThis 上的登记表读取（effect 先按需加载）；
 * - 草稿文件：按依赖顺序（后序）逐个生成 Blob URL；检测循环依赖；
 * - 其余路径一律拒绝。
 */
import type { CompiledFile } from "./compiler";
import { isEffectSpecifier, loadEffect, lookupWith } from "./modules";

const KEY = "__bbblankPlayground__";
const EXTS = ["", ".ts", ".tsx", "/index.ts"];

export class LinkError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}：${message}`);
  }
}

type Lookup = ReturnType<typeof lookupWith>;

const shims = new Map<string, string>();
/** 转发模块读取的登记表：effect 加载后更新为包含 effect 的解析表 */
const table: { get: Lookup } = { get: lookupWith(undefined) };

/** 转发模块：用字符串导出名（ES2022）原样转发全部导出，不受标识符规则限制 */
const shimFor = (key: string, mod: Record<string, unknown>) => {
  let url = shims.get(key);
  if (url) return url;
  (globalThis as Record<string, unknown>)[KEY] = table;
  const names = Object.keys(mod);
  const code = [
    `const m = globalThis[${JSON.stringify(KEY)}].get(${JSON.stringify(key)});`,
    ...names.map((n, i) => `const _${i} = m[${JSON.stringify(n)}];`),
    names.length ? `export { ${names.map((n, i) => `_${i} as ${JSON.stringify(n)}`).join(", ")} };` : "",
  ].join("\n");
  url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  shims.set(key, url);
  return url;
};

const normalize = (path: string) => {
  const out: Array<string> = [];
  for (const seg of path.split("/")) {
    if (seg === "..") out.pop();
    else if (seg && seg !== ".") out.push(seg);
  }
  return out.join("/");
};

type Target = { readonly kind: "file"; readonly path: string } | { readonly kind: "shared"; readonly key: string };

const resolve = (spec: string, from: string, files: ReadonlyMap<string, CompiledFile>, lookup: Lookup): Target => {
  if (!spec.startsWith(".")) {
    if (lookup(spec)) return { kind: "shared", key: spec };
    throw new LinkError(from, `不允许 import "${spec}"（只允许 @bbblank/sdk、@bbblank/host-dom、effect、各插件的 api.ts 与草稿内文件）`);
  }
  const base = normalize(`${from.slice(0, from.lastIndexOf("/"))}/${spec}`);
  for (const ext of EXTS) if (files.has(base + ext)) return { kind: "file", path: base + ext };
  const key = base.replace(/\.ts$/, "");
  if (lookup(key)) return { kind: "shared", key };
  throw new LinkError(from, `找不到 "${spec}"（解析为 ${base}）`);
};

/** 链接并加载入口模块；返回入口模块的命名空间对象 */
export const link = async (files: ReadonlyArray<CompiledFile>, entry: string): Promise<Record<string, unknown>> => {
  const byPath = new Map(files.map((f) => [f.path, f]));
  if (files.some((f) => f.imports.some(isEffectSpecifier))) table.get = lookupWith(await loadEffect());
  const lookup = table.get;
  const urls = new Map<string, string>();
  const visiting = new Set<string>();

  const build = (path: string): string => {
    const done = urls.get(path);
    if (done) return done;
    if (visiting.has(path)) throw new LinkError(path, "存在循环依赖");
    visiting.add(path);
    const f = byPath.get(path)!;
    const targets = f.imports.map((spec) => {
      const t = resolve(spec, path, byPath, lookup);
      return t.kind === "file" ? build(t.path) : shimFor(t.key, lookup(t.key)!);
    });
    const js = f.js.replace(/(["'])__BBPG_(\d+)__\1/g, (_, _q, i: string) => JSON.stringify(targets[Number(i)]));
    const url = URL.createObjectURL(
      new Blob([`${js}\n//# sourceURL=playground:///${path}`], { type: "text/javascript" }),
    );
    visiting.delete(path);
    urls.set(path, url);
    return url;
  };

  if (!byPath.has(entry)) throw new LinkError(entry, "入口文件不存在");
  const url = build(entry);
  try {
    return (await import(/* @vite-ignore */ url)) as Record<string, unknown>;
  } finally {
    // 模块已求值；草稿文件的 Blob URL 不再需要（每次运行生成新的 URL，即新的模块实例）
    for (const u of urls.values()) URL.revokeObjectURL(u);
  }
};
