/**
 * 插件目录：随应用打包，但每个插件的实现是独立 chunk，只在内核需要时（install / bootstrap 恢复）才加载；
 * 远程插件改用 EsmPluginLoader（白名单 + SRI）。
 *
 * 目录约定（每个插件一个目录）：
 * - `index.ts`：插件定义（manifest + setup 编排），只被本文件以 `import()` 引用
 * - `api.ts`：对外契约（服务 Token / Slot / 插件 id 等，只有类型与常量），其他插件只能 import 它
 * - 其余文件：插件内部实现，不得被其他插件 import
 *
 * 本文件只能静态 import 各插件的 `api.ts`；静态 import `index.ts` 会把插件实现并回入口 chunk。
 */
import type { PluginID } from "@bbblank/sdk";
import type { PluginImport } from "@bbblank/host-dom";
import { AboutPluginId } from "./about/api";
import { BlogPluginId } from "./blog/api";
import { ContentPluginId } from "./content/api";
import { PluginManagerPluginId } from "./plugin-manager/api";
import { ShellPluginId } from "./shell/api";
import { WeatherPluginId } from "./weather/api";

export interface PluginEntry {
  readonly id: PluginID;
  readonly load: PluginImport;
  /** 首次访问时自动安装；否则只在运行时按需安装（如经 plugin-manager） */
  readonly builtin: boolean;
}

/** builtin 插件按依赖顺序排列：首次访问时依次安装 */
export const plugins: ReadonlyArray<PluginEntry> = [
  { id: ShellPluginId, builtin: true, load: () => import("./shell").then((m) => m.shell) },
  { id: ContentPluginId, builtin: true, load: () => import("./content").then((m) => m.content) },
  {
    id: PluginManagerPluginId,
    builtin: true,
    load: () => import("./plugin-manager").then((m) => m.pluginManager),
  },
  { id: AboutPluginId, builtin: false, load: () => import("./about").then((m) => m.about) },
  { id: BlogPluginId, builtin: false, load: () => import("./blog").then((m) => m.blog) },
  { id: WeatherPluginId, builtin: false, load: () => import("./weather").then((m) => m.weather) },
];
