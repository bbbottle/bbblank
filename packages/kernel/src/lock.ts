/**
 * 每插件读写锁 —— 设计文档 §10.1
 * Semaphore(MAX)：独占 = MAX 个许可，共享 = 1 个。多把锁按 PluginID 字典序获取，杜绝死锁。
 * Semaphore 不可重入：只在公开生命周期操作的最外层取锁。
 */
import { Semaphore } from 'effect';
import type { Effect } from 'effect';
import type { PluginID } from '@bbblank/sdk';

const MAX = 1 << 20;

export type LockMode = 'exclusive' | 'shared';
export type LockRequest = readonly [PluginID, LockMode];

export const makeLocks = () => {
  const sems = new Map<PluginID, Semaphore.Semaphore>();
  const sem = (id: PluginID) => {
    let s = sems.get(id);
    if (!s) sems.set(id, (s = Semaphore.makeUnsafe(MAX)));
    return s;
  };

  return <A, E, R>(reqs: ReadonlyArray<LockRequest>, eff: Effect.Effect<A, E, R>) => {
    const merged = new Map<PluginID, LockMode>();
    for (const [id, mode] of reqs) {
      if (mode === 'exclusive' || !merged.has(id)) merged.set(id, mode);
    }
    return [...merged]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .reduceRight(
        (acc, [id, mode]) => Semaphore.withPermits(sem(id), mode === 'exclusive' ? MAX : 1)(acc),
        eff
      );
  };
};
