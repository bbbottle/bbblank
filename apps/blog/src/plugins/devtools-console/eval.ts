/**
 * Console REPL 求值：纯 JS，与 Chrome Console 一致地以「补全值」为结果。
 * - 表达式（含对象字面量、箭头函数、顶层 await）作为 async 函数体的返回值，避免 `{a: 1}` 被解析为语句块；
 * - 语句块（声明、控制流等）原样作为 async 函数体执行，返回 `undefined`（声明本就无补全值）。
 * 全局只暴露插件 SDK 面（见 sdkGlobals），运行期值（pm、kernel）由面板注入，与 capability 模型一致。
 */
import * as sdk from "@bbblank/sdk";
import * as hostDom from "@bbblank/host-dom";

type Namespace = Record<string, unknown>;

/** 各插件的 api.ts（契约）：静态 import 只引入契约、不加载插件实现 */
const apis = import.meta.glob<Namespace>("../*/api.ts", { eager: true });

/** glob 键为 "../<name>/api.ts"；本插件自身的 api.ts 被归一化为 "./api.ts"（其目录名即 devtools-console） */
const globalName = (key: string) => {
  const dir = key === "./api.ts" ? "devtools-console" : key.slice(3, key.lastIndexOf("/"));
  return dir.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
};

/** REPL 全局中的静态 SDK 面；运行期值（pm、kernel）由面板补充 */
export const sdkGlobals = (): Record<string, unknown> => ({
  sdk,
  hostDom,
  ...Object.fromEntries(
    Object.entries(apis)
      .map(([k, ns]) => [globalName(k), ns] as const)
      .filter(([name]) => name.length > 0),
  ),
});

type AsyncFunctionCtor = new (
  ...args: Array<string>
) => (...args: Array<unknown>) => Promise<unknown>;

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as AsyncFunctionCtor;

/** 只解析不执行：能否作为表达式（括号包裹后）解析。用 AsyncFunction 以便把顶层 `await x` 识别为表达式。 */
const isExpression = (code: string) => {
  try {
    new AsyncFunction(`return (\n${code}\n);`);
    return true;
  } catch {
    return false;
  }
};

/** 求值一段代码；scope 的键即全局变量名。错误经 reject 抛出。 */
export const evaluate = (code: string, scope: Record<string, unknown>): Promise<unknown> => {
  const keys = Object.keys(scope);
  // 表达式直接作为 async 函数体返回（支持顶层 await 与对象字面量）；语句块原样执行（声明/控制流返回 undefined）
  const fn = isExpression(code)
    ? new AsyncFunction(...keys, `"use strict";\nreturn await (\n${code}\n);`)
    : new AsyncFunction(...keys, `"use strict";\n${code}\n`);
  return fn(...keys.map((k) => scope[k]));
};
