/**
 * PluginLoader —— 设计文档 §4.4，抽象服务：内核不提供默认实现（动态 import 是宿主能力）。
 * `PluginLoader.fromMap` 为测试/内存宿主的便捷 Layer。
 */
import { Context, Effect, Layer } from 'effect';
import type { AnyPluginModule, PluginID, PluginManifest } from '@bbblank/sdk';
import { manifestOf } from '@bbblank/sdk';
import { ManifestInvalid, PluginLoadError } from './errors.js';

export interface PluginLoaderShape {
  readonly load: (
    id: PluginID
  ) => Effect.Effect<AnyPluginModule, PluginLoadError | ManifestInvalid>;
  readonly listAvailable: Effect.Effect<ReadonlyArray<PluginManifest>>;
}

export class PluginLoader extends Context.Service<PluginLoader, PluginLoaderShape>()(
  '@kernel/PluginLoader'
) {
  static readonly fromMap = (mods: ReadonlyMap<PluginID, AnyPluginModule>) =>
    Layer.succeed(
      PluginLoader,
      PluginLoader.of({
        load: id => {
          const m = mods.get(id);
          return m
            ? Effect.succeed(m)
            : Effect.fail(new PluginLoadError({ id, cause: 'plugin not in map' }));
        },
        listAvailable: Effect.succeed([...mods.values()].map(manifestOf)),
      })
    );
}
