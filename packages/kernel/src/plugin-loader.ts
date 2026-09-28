/**
 * PluginLoader —— 设计文档 §4.4 / §10.4，抽象服务：内核不提供默认实现（动态 import 是宿主能力）。
 * `PluginLoader.fromMap` 为测试/内存宿主的便捷 Layer；生产加载器（白名单/SRI/大小/超时）见宿主层。
 * 内核对 load 统一加超时并用 validateModule 校验返回值结构。
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

/** 动态边界上的结构校验：manifest 之外，kind 与入口函数/Layer 也必须存在 */
export const validateModule = (
  id: PluginID,
  mod: unknown
): Effect.Effect<AnyPluginModule, ManifestInvalid> => {
  const m = mod as Partial<Record<string, unknown>> | null;
  const issue =
    typeof m !== 'object' || m === null
      ? 'module is not an object'
      : typeof m.manifest !== 'object' || m.manifest === null
        ? 'missing manifest'
        : !Array.isArray(m.capabilities)
          ? 'capabilities must be an array'
          : m.kind === 'plain'
            ? typeof m.setup === 'function'
              ? undefined
              : 'plain plugin must have setup()'
            : m.kind === 'effect'
              ? m.layer
                ? undefined
                : 'effect plugin must have layer'
              : `unknown kind ${String(m.kind)}`;
  return issue
    ? Effect.fail(new ManifestInvalid({ id, issue }))
    : Effect.succeed(mod as AnyPluginModule);
};
