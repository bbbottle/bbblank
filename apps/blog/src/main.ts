/**
 * kernel boot —— 空白 HTML 的唯一入口：组装宿主 Capability，启动内核，页面由插件拼出。
 */
import { Layer } from "effect";
import { Storage } from "@bbblank/sdk";
import {
  InstallStore,
  PluginLoader,
  PluginStorageLive,
  createKernel,
} from "@bbblank/kernel";
import type { KernelView } from "@bbblank/kernel";
import {
  Dom,
  DomLive,
  PluginManager,
  PluginManagerLive,
  Router,
  RouterLive,
  localStorageKeyValue,
} from "@bbblank/host-dom";
import { builtins, optionals } from "./plugins";

declare global {
  interface Window {
    bbking?: KernelView;
  }
}

const kv = localStorageKeyValue();

const loadable = [...builtins, ...optionals];

const kernel = createKernel({
  capabilities: [Dom, Router, Storage, PluginManager],
  capabilityLayer: Layer.mergeAll(
    DomLive(document),
    RouterLive(window),
    PluginStorageLive.pipe(Layer.provide(kv)),
    PluginManagerLive((): KernelView => kernel.view),
  ),
  loader: PluginLoader.fromMap(
    new Map(loadable.map((p) => [p.manifest.id, p])),
  ),
  store: InstallStore.fromKeyValue.pipe(Layer.provide(kv)),
});

const shipped = new Set(loadable.map((p) => p.manifest.id));
const report = await kernel.bootstrap();
for (const f of report.failed) {
  // store 是期望态：代码里已移除的插件仍留有记录，收敛为卸载，而不是每次启动都报加载失败
  if (!shipped.has(f.id)) {
    await kernel.view
      .uninstall(f.id)
      .catch((e) => console.error("[bbking] prune failed", e));
    console.info(`[bbking] pruned removed plugin: ${f.id}`);
  } else {
    console.warn(`[bbking] ${f.id} failed: ${f.error.tag} ${f.error.message}`);
  }
}

// 首次访问 store 为空：安装内置插件；用户停用过的（记录为 disabled）保持不动
const known = kernel.view.snapshot().plugins;
for (const p of builtins) {
  if (!known.has(p.manifest.id)) {
    await kernel.view
      .install(p.manifest.id)
      .catch((e) => console.error("[bbblank] install failed", e));
  }
}

window.bbking = kernel.view;
window.addEventListener("pagehide", () => void kernel.dispose());
