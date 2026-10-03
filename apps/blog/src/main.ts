/**
 * kernel boot —— 空白 HTML 的唯一入口：组装宿主 Capability，启动内核，页面由插件拼出。
 */
import { Layer } from "effect";
import { Storage } from "@bbblank/sdk";
import { InstallStore, PermissionPolicy, PluginStorageLive, createKernel } from "@bbblank/kernel";
import type { KernelView } from "@bbblank/kernel";
import {
  Dom,
  DomLive,
  Html,
  HtmlLive,
  LazyPluginLoader,
  PluginManager,
  PluginManagerLive,
  Router,
  RouterLive,
  Sideload,
  SideloadLive,
  SideloadLoader,
  SideloadRegistry,
  isSideloadId,
  localStorageKeyValue,
} from "@bbblank/host-dom";
import { plugins } from "./plugins";

declare global {
  interface Window {
    bbking?: KernelView;
  }
}

const kv = localStorageKeyValue();
/** devtools Playground 在浏览器中编译出的插件（id 以 dev- 开头），仅存在于当前页面会话 */
const sideload = new SideloadRegistry();

const capabilities = [Dom, Router, Storage, PluginManager, Html, Sideload] as const;
/** 宿主授权上限：所有能力最高可授予 write、服务按 manifest 声明提供（等同于信任 manifest 申请） */
const fullAccess = Object.fromEntries(capabilities.map((c) => [c.id, "write" as const]));

const kernel = createKernel({
  capabilities: [...capabilities],
  capabilityLayer: Layer.mergeAll(
    DomLive(document),
    RouterLive(window),
    HtmlLive(window),
    SideloadLive(sideload),
    PluginStorageLive.pipe(Layer.provide(kv)),
    PluginManagerLive(
      (): KernelView => kernel.view,
      plugins.map(({ id, name, version, description }) => ({
        id,
        name,
        version,
        description,
      })),
    ),
  ),
  loader: SideloadLoader(sideload, LazyPluginLoader(new Map(plugins.map((p) => [p.id, p.load])))),
  store: InstallStore.fromKeyValue.pipe(Layer.provide(kv)),
  // restrict 对每个插件都须给出上限（返回 undefined 即拒绝激活）。
  // 开发插件按申请授予能力，唯 PluginManager 限为只读：不能安装、启停、卸载其他插件
  permission: PermissionPolicy.restrict((m) => ({
    access: isSideloadId(m.id) ? { ...fullAccess, pluginManager: "read" } : fullAccess,
    provide: ["*"],
  })),
});

const shipped = new Set(plugins.map((p) => p.id));
const report = await kernel.bootstrap();
for (const f of report.failed) {
  // store 是期望态：代码里已移除的插件仍留有记录，收敛为卸载，而不是每次启动都报加载失败
  if (!shipped.has(f.id)) {
    await kernel.view
      .uninstall(f.id)
      .catch((e) => console.error("[bbking] prune failed", e));
    // 开发插件（dev-）只存在于上一次页面会话：刷新后其模块已不存在，按预期清理，不再提示
    if (!isSideloadId(f.id)) console.info(`[bbking] pruned removed plugin: ${f.id}`);
  } else {
    console.warn(`[bbking] ${f.id} failed: ${f.error.tag} ${f.error.message}`);
  }
}

// 首次访问 store 为空：安装内置插件；用户停用过的（记录为 disabled）保持不动
const known = kernel.view.snapshot().plugins;
const missing = plugins.filter((p) => p.builtin && !known.has(p.id));
// 安装须按依赖顺序串行，chunk 下载则提前并行发起，避免逐个请求的瀑布；import() 结果由运行时缓存
for (const p of missing) void p.load().catch(() => {});
for (const p of missing) {
  await kernel.view
    .install(p.id)
    .catch((e) => console.error("[bbblank] install failed", e));
}

window.bbking = kernel.view;
window.addEventListener("pagehide", () => void kernel.dispose());
