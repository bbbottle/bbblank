/**
 * 依赖拓扑 —— Kahn 分层：同层无相互依赖可并行初始化；含环返回 DependencyCycle。
 * 输入：id → 其依赖集合 的有向边（只包含本次参与排序的节点）。
 */
import { Effect } from 'effect';
import type { PluginID } from '@bbblank/sdk';
import { DependencyCycle } from './errors.js';

export const topoLevels = (
  deps: ReadonlyMap<PluginID, ReadonlySet<PluginID>>
): Effect.Effect<ReadonlyArray<ReadonlyArray<PluginID>>, DependencyCycle> =>
  Effect.suspend(() => {
    const indegree = new Map<PluginID, number>();
    const dependents = new Map<PluginID, Set<PluginID>>();
    const ensure = (id: PluginID) => {
      if (!indegree.has(id)) indegree.set(id, 0);
      if (!dependents.has(id)) dependents.set(id, new Set());
    };
    for (const [id, ds] of deps) {
      ensure(id);
      for (const d of ds) {
        ensure(d);
        dependents.get(d)!.add(id);
        indegree.set(id, (indegree.get(id) ?? 0) + 1);
      }
    }

    const levels: Array<Array<PluginID>> = [];
    let remaining = indegree.size;
    let frontier = [...indegree.entries()].filter(([, n]) => n === 0).map(([id]) => id);
    while (frontier.length > 0) {
      levels.push(frontier);
      remaining -= frontier.length;
      const next: Array<PluginID> = [];
      for (const id of frontier) {
        for (const dependent of dependents.get(id) ?? []) {
          const n = (indegree.get(dependent) ?? 0) - 1;
          indegree.set(dependent, n);
          if (n === 0) next.push(dependent);
        }
      }
      frontier = next;
    }

    if (remaining > 0) {
      const cycle = [...indegree.entries()].filter(([, n]) => n > 0).map(([id]) => id);
      return Effect.fail(new DependencyCycle({ cycle }));
    }
    return Effect.succeed(levels);
  });
