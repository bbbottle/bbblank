/**
 * 内置插件：随应用打包；远程插件改用 EsmPluginLoader（白名单 + SRI）。
 *
 * 目录约定（每个插件一个目录）：
 * - `index.ts`：插件定义（manifest + setup 编排），只被本文件 import
 * - `api.ts`：对外契约（服务 Token / Slot / 插件 id 等，只有类型与常量），其他插件只能 import 它
 * - 其余文件：插件内部实现，不得被其他插件 import
 */
import type { AnyPluginModule } from "@bbblank/sdk";
import { about } from "./about";
import { blog } from "./blog";
import { content } from "./content";
import { pluginManager } from "./plugin-manager";
import { shell } from "./shell";

/** 首次访问时自动安装 */
export const builtins: ReadonlyArray<AnyPluginModule> = [
  shell,
  content,
  pluginManager,
];

/** 随应用打包、可被加载，但只在运行时按需安装（如经 plugin-manager） */
export const optionals: ReadonlyArray<AnyPluginModule> = [about, blog];
