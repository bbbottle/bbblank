/**
 * PluginStorageLive —— 设计文档 §10.8：sdk `Storage` capability 的内核实现。
 * 建立在宿主提供的 KeyValueStore 之上，按 pluginId 命名空间隔离。
 */
import { Effect, Layer } from 'effect';
import { Storage } from '@bbblank/sdk';
import type { PluginID } from '@bbblank/sdk';
import { KeyValueStore } from './key-value-store.js';

const ns = (id: PluginID) => `bbblank:plugin:${id}:`;

export const PluginStorageLive = Layer.effect(
  Storage.tag,
  Effect.map(Effect.service(KeyValueStore), kv => {
    const keys = (id: PluginID) =>
      Effect.map(kv.keys(ns(id)), ks => ks.map(k => k.slice(ns(id).length)));
    return {
      get: (id, key) => kv.get(ns(id) + key),
      set: (id, key, value) => kv.set(ns(id) + key, value),
      remove: (id, key) => kv.remove(ns(id) + key),
      keys,
      clear: id =>
        Effect.flatMap(keys(id), ks =>
          Effect.forEach(ks, k => kv.remove(ns(id) + k), { discard: true })
        ),
    };
  })
);
