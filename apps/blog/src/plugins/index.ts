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
 * name / version / description 是不加载插件代码即可展示的元数据（devtools 市场的数据源），
 * 须与插件 manifest 保持一致（内核加载时以 manifest 为准）。
 */
import type { PluginID } from "@bbblank/sdk";
import type { PluginCatalogEntry, PluginImport } from "@bbblank/host-dom";
import { AboutPluginId } from "./about/api";
import { BlogPluginId } from "./blog/api";
import { ContentPluginId } from "./content/api";
import { DevtoolsPluginId } from "./devtools/api";
import { DevtoolsApplicationPluginId } from "./devtools-application/api";
import { DevtoolsConsolePluginId } from "./devtools-console/api";
import { DevtoolsNetworkPluginId } from "./devtools-network/api";
import { PluginManagerPluginId } from "./plugin-manager/api";
import { ShellPluginId } from "./shell/api";
import { WeatherPluginId } from "./weather/api";

export interface PluginEntry extends PluginCatalogEntry {
  readonly id: PluginID;
  readonly load: PluginImport;
  /** 首次访问时自动安装；否则只在运行时按需安装（如经 plugin-manager） */
  readonly builtin: boolean;
}

/** builtin 插件按依赖顺序排列：首次访问时依次安装 */
export const plugins: ReadonlyArray<PluginEntry> = [
  {
    id: ShellPluginId,
    name: "Shell",
    version: "1.1.0",
    description: "页面骨架、挂载点、站内路由与脚注。",
    builtin: true,
    load: () => import("./shell").then((m) => m.shell),
  },
  {
    id: ContentPluginId,
    name: "Content",
    version: "1.0.0",
    description: "按路由渲染信件与文章列表，提供内容笔记服务。",
    builtin: true,
    load: () => import("./content").then((m) => m.content),
  },
  {
    id: PluginManagerPluginId,
    name: "Plugin Manager",
    version: "1.0.0",
    description: "响应信件方块的点击，安装插件或打开 devtools。",
    builtin: true,
    load: () => import("./plugin-manager").then((m) => m.pluginManager),
  },
  {
    id: AboutPluginId,
    name: "About",
    version: "1.0.0",
    description: "为「十年前的我」添加作者笔记。",
    builtin: false,
    load: () => import("./about").then((m) => m.about),
  },
  {
    id: BlogPluginId,
    name: "Blog",
    version: "1.0.0",
    description: "为「组装好的文字」添加指向 /blog 的笔记。",
    builtin: false,
    load: () => import("./blog").then((m) => m.blog),
  },
  {
    id: WeatherPluginId,
    name: "Weather",
    version: "1.0.0",
    description: "查询长沙今日天气（Open-Meteo），为落款「长沙」添加笔记。",
    builtin: false,
    load: () => import("./weather").then((m) => m.weather),
  },
  {
    id: DevtoolsPluginId,
    name: "DevTools",
    version: "1.0.0",
    description:
      "仿 Chrome DevTools 的底部抽屉：内置 Plugins（依赖树与启停）与 Market（插件目录与安装）；其余面板由面板插件提供。",
    builtin: false,
    load: () => import("./devtools").then((m) => m.devtools),
  },
  {
    id: DevtoolsConsolePluginId,
    name: "DevTools Console",
    version: "1.0.0",
    description: "DevTools 面板：插件之间的事件与内容，警告与错误计数。",
    builtin: false,
    load: () => import("./devtools-console").then((m) => m.devtoolsConsole),
  },
  {
    id: DevtoolsNetworkPluginId,
    name: "DevTools Network",
    version: "1.0.0",
    description: "DevTools 面板：插件加载、启用、停止各阶段耗时与瀑布图。",
    builtin: false,
    load: () => import("./devtools-network").then((m) => m.devtoolsNetwork),
  },
  {
    id: DevtoolsApplicationPluginId,
    name: "DevTools Application",
    version: "1.0.0",
    description: "DevTools 面板：安装记录、审计日志与事件统计。",
    builtin: false,
    load: () => import("./devtools-application").then((m) => m.devtoolsApplication),
  },
];
