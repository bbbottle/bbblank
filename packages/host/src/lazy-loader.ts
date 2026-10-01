/**
 * LazyPluginLoader —— 随应用打包、按需加载的插件（打包器据 `() => import()` 拆分为独立 chunk）。
 * 只有内核真正需要某插件（install / bootstrap 恢复）时才执行对应的 import；
 * 结构与 manifest 校验（含 manifest.id 与目录键一致）由内核完成。
 * 远程第三方插件仍用 EsmPluginLoader（白名单 + SRI）。
 */
import { Effect, Layer } from 'effect';
import { PluginLoadError, PluginLoader } from '@bbblank/kernel';
import type { AnyPluginModule, PluginID } from '@bbblank/sdk';

export type PluginImport = () => Promise<unknown>;

export const LazyPluginLoader = (catalog: ReadonlyMap<PluginID, PluginImport>) =>
  Layer.succeed(
    PluginLoader,
    PluginLoader.of({
      load: id =>
        Effect.tryPromise({
          try: () => {
            const load = catalog.get(id);
            if (!load) throw new Error('plugin not in catalog');
            return load() as Promise<AnyPluginModule>;
          },
          catch: cause => new PluginLoadError({ id, cause }),
        }),
      // 列出 manifest 需要先加载模块，与按需加载的目的相悖，故不提供
      listAvailable: Effect.succeed([]),
    })
  );
