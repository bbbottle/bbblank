/**
 * KeyValueStore —— 设计文档 §10.8，抽象持久化服务（字符串值）。
 * 内核只提供 memory 实现；localStorage / IndexedDB / fs 适配属于宿主。
 * InstallStore.fromKeyValue 与 PluginStorageLive 都建立在它之上。
 */
import { Context, Effect, Layer } from 'effect';
import type { StorageError } from '@bbblank/sdk';

export interface KeyValueStoreShape {
  readonly get: (key: string) => Effect.Effect<string | undefined, StorageError>;
  readonly set: (key: string, value: string) => Effect.Effect<void, StorageError>;
  readonly remove: (key: string) => Effect.Effect<void, StorageError>;
  readonly keys: (prefix: string) => Effect.Effect<ReadonlyArray<string>, StorageError>;
}

export class KeyValueStore extends Context.Service<KeyValueStore, KeyValueStoreShape>()(
  '@kernel/KeyValueStore'
) {
  static readonly memory = (initial: Iterable<readonly [string, string]> = []) =>
    Layer.sync(KeyValueStore, () => {
      const m = new Map(initial);
      return KeyValueStore.of({
        get: key => Effect.sync(() => m.get(key)),
        set: (key, value) => Effect.sync(() => void m.set(key, value)),
        remove: key => Effect.sync(() => void m.delete(key)),
        keys: prefix => Effect.sync(() => [...m.keys()].filter(k => k.startsWith(prefix))),
      });
    });
}
