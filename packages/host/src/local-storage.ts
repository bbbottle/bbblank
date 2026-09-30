/**
 * localStorage 版 KeyValueStore —— 设计文档 §10.8
 * 供 InstallStore.fromKeyValue（期望态持久化）与 PluginStorageLive（插件私有 KV）共用。
 */
import { Effect, Layer } from 'effect';
import { KeyValueStore, StorageError } from '@bbblank/kernel';

export const localStorageKeyValue = (storage: Storage = globalThis.localStorage) => {
  const attempt = <A>(op: string, f: () => A) =>
    Effect.try({ try: f, catch: cause => new StorageError({ op, cause }) });
  return Layer.succeed(
    KeyValueStore,
    KeyValueStore.of({
      get: key => attempt('get', () => storage.getItem(key) ?? undefined),
      set: (key, value) => attempt('set', () => storage.setItem(key, value)),
      remove: key => attempt('remove', () => storage.removeItem(key)),
      keys: prefix =>
        attempt('keys', () =>
          Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(
            (k): k is string => k !== null && k.startsWith(prefix)
          )
        ),
    })
  );
};
