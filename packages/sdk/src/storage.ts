/**
 * Storage capability 契约 —— 设计文档 §10.8
 * 每插件私有 KV（按 pluginId 命名空间隔离）；读方法需 read，写方法需 write。
 * Shape 由内核基于抽象 KeyValueStore 实现（PluginStorageLive），宿主只需提供 KeyValueStore。
 */
import type { Effect } from 'effect';
import { defineCapability } from './capability.js';
import type { StorageError } from './errors.js';
import type { PluginID } from './manifest.js';

export interface StorageShape {
  readonly get: (pluginId: PluginID, key: string) => Effect.Effect<string | undefined, StorageError>;
  readonly set: (pluginId: PluginID, key: string, value: string) => Effect.Effect<void, StorageError>;
  readonly remove: (pluginId: PluginID, key: string) => Effect.Effect<void, StorageError>;
  readonly keys: (pluginId: PluginID) => Effect.Effect<ReadonlyArray<string>, StorageError>;
  readonly clear: (pluginId: PluginID) => Effect.Effect<void, StorageError>;
}

export interface StorageFacade {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<ReadonlyArray<string>>;
  clear(): Promise<void>;
}

export const Storage = defineCapability<'storage', StorageShape, StorageFacade>(
  'storage',
  (s, ctx) => {
    const id = ctx.pluginId;
    ctx.onUninstall(s.clear(id));
    const write = async <A>(f: () => Promise<A>) => {
      ctx.require('write');
      return f();
    };
    return {
      get: key => ctx.run(s.get(id, key)),
      keys: () => ctx.run(s.keys(id)),
      set: (key, value) => write(() => ctx.run(s.set(id, key, value))),
      remove: key => write(() => ctx.run(s.remove(id, key))),
      clear: () => write(() => ctx.run(s.clear(id))),
    };
  }
);
