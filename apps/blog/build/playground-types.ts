/**
 * Playground 语言服务的类型文件包：虚拟文件系统路径 → 文件内容。
 * - /repo/...：仓库源码（sdk / kernel / host 的 src，与 apps/blog/src/plugins/<name>/api.ts），保持仓库目录结构，
 *   使 api.ts 中的相对路径（如 ../shell/api、../../../../../packages/host/src）照常解析；
 * - /repo/node_modules/...：effect（从入口出发的 .d.ts 闭包）与 dompurify 的声明；
 * - /lib/...：TypeScript 标准库（lib.es2022 / dom / dom.iterable 及其 /// <reference lib> 闭包）。
 * 由 vite.config.ts 在构建时生成为静态资源、开发时经中间件提供。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const req = createRequire(join(here, "../package.json"));

/** 语言服务的模块解析映射（与文件包中的路径对应） */
export const typePaths = {
  "@bbblank/sdk": ["/repo/packages/sdk/src/index.ts"],
  "@bbblank/kernel": ["/repo/packages/kernel/src/index.ts"],
  "@bbblank/host-dom": ["/repo/packages/host/src/index.ts"],
  effect: ["/repo/node_modules/effect/dist/index.d.ts"],
  "effect/*": ["/repo/node_modules/effect/dist/*.d.ts"],
  dompurify: ["/repo/node_modules/dompurify/dist/purify.es.d.mts"],
} as const;

const read = (p: string) => readFileSync(p, "utf8");

const sourceFiles = (dir: string) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "test-kit.ts")
    .map((f) => join(dir, f));

/** 从入口出发的相对引用闭包（.ts / .js 后缀按声明文件解析） */
const dtsClosure = (entry: string) => {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f) || !existsSync(f)) continue;
    seen.add(f);
    for (const m of read(f).matchAll(/(?:^|\n)\s*(?:import|export)[^"'\n]*?from\s*"(\.{1,2}\/[^"]+)"|import\("(\.{1,2}\/[^"]+)"\)/g)) {
      let p = resolve(dirname(f), m[1] ?? m[2]!).replace(/\.(ts|js)$/, ".d.ts");
      if (!p.endsWith(".d.ts")) p += "/index.d.ts";
      stack.push(p);
    }
  }
  return [...seen];
};

const libClosure = (libDir: string, roots: ReadonlyArray<string>) => {
  const seen = new Set<string>();
  const stack = [...roots];
  while (stack.length) {
    const name = stack.pop()!;
    const file = join(libDir, `lib.${name}.d.ts`);
    if (seen.has(name) || !existsSync(file)) continue;
    seen.add(name);
    for (const m of read(file).matchAll(/\/\/\/\s*<reference lib="([^"]+)"\s*\/>/g)) stack.push(m[1]!.toLowerCase());
  }
  return [...seen].map((n) => join(libDir, `lib.${n}.d.ts`));
};

export interface PlaygroundTypes {
  /** 语言服务的 compilerOptions.paths */
  readonly paths: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly files: Readonly<Record<string, string>>;
}

export const collectPlaygroundTypes = (): PlaygroundTypes => {
  const files: Record<string, string> = {};
  const add = (vpath: string, abs: string) => void (files[vpath] = read(abs));

  for (const pkg of ["sdk", "kernel", "host"])
    for (const f of sourceFiles(join(repo, "packages", pkg, "src"))) add(`/repo/${relative(repo, f)}`, f);

  const plugins = join(repo, "apps/blog/src/plugins");
  for (const name of readdirSync(plugins)) {
    const api = join(plugins, name, "api.ts");
    if (existsSync(api)) add(`/repo/${relative(repo, api)}`, api);
  }

  const effectDist = dirname(req.resolve("effect"));
  for (const f of dtsClosure(join(effectDist, "index.d.ts")))
    add(`/repo/node_modules/effect/dist/${relative(effectDist, f)}`, f);

  const hostReq = createRequire(join(repo, "packages/host/package.json"));
  const purify = join(dirname(dirname(hostReq.resolve("dompurify"))), "dist/purify.es.d.mts");
  add("/repo/node_modules/dompurify/dist/purify.es.d.mts", purify);

  const libDir = dirname(req.resolve("typescript-browser/lib/typescript.js"));
  for (const f of libClosure(libDir, ["es2022", "dom", "dom.iterable"])) add(`/lib/${relative(libDir, f)}`, f);

  return { paths: typePaths, files };
};
