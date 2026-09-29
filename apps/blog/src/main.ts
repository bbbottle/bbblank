/**
 * kernel boot —— 空白 HTML 的唯一入口：组装宿主 Capability，启动内核，页面由插件拼出。
 */
import { Layer } from 'effect';
import { Storage } from '@bbblank/sdk';
import { InstallStore, PluginLoader, PluginStorageLive, createKernel } from '@bbblank/kernel';
import type { KernelView } from '@bbblank/kernel';
import { Dom, DomLive, Router, RouterLive, localStorageKeyValue } from '@bbblank/host-dom';
import { builtins } from './plugins';

declare global {
  interface Window {
    /** 调试入口：`await bbblank.diagnostics()` */
    bbblank?: KernelView;
  }
}

const kv = localStorageKeyValue();

const kernel = createKernel({
  capabilities: [Dom, Router, Storage],
  capabilityLayer: Layer.mergeAll(
    DomLive(document),
    RouterLive(window),
    PluginStorageLive.pipe(Layer.provide(kv))
  ),
  loader: PluginLoader.fromMap(new Map(builtins.map(p => [p.manifest.id, p]))),
  store: InstallStore.fromKeyValue.pipe(Layer.provide(kv)),
});

const shipped = new Set(builtins.map(p => p.manifest.id));
const report = await kernel.bootstrap();
for (const f of report.failed) {
  // store 是期望态：代码里已移除的插件仍留有记录，收敛为卸载，而不是每次启动都报加载失败
  if (!shipped.has(f.id)) {
    await kernel.view.uninstall(f.id).catch(e => console.error('[bbblank] prune failed', e));
    console.info(`[bbblank] pruned removed plugin: ${f.id}`);
  } else {
    console.warn(`[bbblank] ${f.id} failed: ${f.error.tag} ${f.error.message}`);
  }
}

// 首次访问 store 为空：安装内置插件；用户停用过的（记录为 disabled）保持不动
const known = kernel.view.snapshot().plugins;
for (const p of builtins) {
  if (!known.has(p.manifest.id)) {
    await kernel.view.install(p.manifest.id).catch(e => console.error('[bbblank] install failed', e));
  }
}

window.bbblank = kernel.view;
window.addEventListener('pagehide', () => void kernel.dispose());
