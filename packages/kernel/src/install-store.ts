/**
 * InstallStore —— 设计文档 §4.4 / §10.8：期望态（desired state）持久化。
 * 内核不提供平台实现；`memory` 用于测试/内存宿主，`fromKeyValue` 组合任意宿主 KeyValueStore 得到 durable 实现。
 */
import { Context, Effect, Layer, Schema } from 'effect';
import { PluginID } from '@bbblank/sdk';
import type { StorageError } from '@bbblank/sdk';
import { KeyValueStore } from './key-value-store.js';

export const InstallRecord = Schema.Struct({
  id: PluginID,
  enabled: Schema.Boolean,
  /** 原始（未解码）配置 */
  config: Schema.optionalKey(Schema.Unknown),
});
export type InstallRecord = typeof InstallRecord.Type;

export interface InstallStoreShape {
  readonly list: Effect.Effect<ReadonlyArray<InstallRecord>, StorageError>;
  readonly put: (rec: InstallRecord) => Effect.Effect<void, StorageError>;
  readonly remove: (id: PluginID) => Effect.Effect<void, StorageError>;
}

const PREFIX = 'bbblank:install:';
const decodeRecord = Schema.decodeUnknownEffect(Schema.fromJsonString(InstallRecord));

export class InstallStore extends Context.Service<InstallStore, InstallStoreShape>()(
  '@kernel/InstallStore'
) {
  static readonly memory = (initial: Iterable<PluginID | InstallRecord> = []) =>
    Layer.sync(InstallStore, () => {
      const m = new Map<PluginID, InstallRecord>();
      for (const r of initial) {
        const rec = typeof r === 'string' ? { id: r, enabled: true } : r;
        m.set(rec.id, rec);
      }
      return InstallStore.of({
        list: Effect.sync(() => [...m.values()]),
        put: rec => Effect.sync(() => void m.set(rec.id, rec)),
        remove: id => Effect.sync(() => void m.delete(id)),
      });
    });

  /** 每条记录一个 key；损坏记录跳过并记 warning，不阻断启动 */
  static readonly fromKeyValue = Layer.effect(
    InstallStore,
    Effect.map(Effect.service(KeyValueStore), kv =>
      InstallStore.of({
        list: Effect.gen(function* () {
          const keys = yield* kv.keys(PREFIX);
          const out: Array<InstallRecord> = [];
          for (const key of keys) {
            const raw = yield* kv.get(key);
            if (raw === undefined) continue;
            const rec = yield* decodeRecord(raw).pipe(
              Effect.tapError(e => Effect.logWarning('install record corrupted, skipped', key, String(e))),
              Effect.option
            );
            if (rec._tag === 'Some') out.push(rec.value);
          }
          return out;
        }),
        put: rec => kv.set(PREFIX + rec.id, JSON.stringify(rec)),
        remove: id => kv.remove(PREFIX + id),
      })
    )
  );
}
