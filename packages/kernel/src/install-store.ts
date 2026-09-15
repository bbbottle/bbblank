/**
 * InstallStore —— 设计文档 §4.4，抽象服务：内核不提供默认实现（localStorage 等是宿主能力）。
 * `InstallStore.memory` 为测试/内存宿主的便捷 Layer。
 */
import { Context, Effect, Layer, Ref } from 'effect';
import type { PluginID } from '@bbblank/sdk';

export interface InstallStoreShape {
  readonly read: Effect.Effect<ReadonlySet<PluginID>>;
  readonly write: (ids: ReadonlySet<PluginID>) => Effect.Effect<void>;
}

export class InstallStore extends Context.Service<InstallStore, InstallStoreShape>()(
  '@kernel/InstallStore'
) {
  static readonly memory = (initial: ReadonlySet<PluginID> = new Set()) =>
    Layer.effect(
      InstallStore,
      Effect.map(Ref.make(new Set(initial)), ref =>
        InstallStore.of({
          read: Ref.get(ref),
          write: ids => Ref.set(ref, new Set(ids)),
        })
      )
    );
}
