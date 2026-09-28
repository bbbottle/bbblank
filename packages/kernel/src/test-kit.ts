/** 测试共用工具（不进入构建产物） */
import { Effect, Layer } from 'effect';
import { defineCapability } from '@bbblank/sdk';
import type { AnyPluginModule, PluginID, SemVer } from '@bbblank/sdk';
import { createKernel } from './create-kernel.js';
import type { KernelConfig } from './create-kernel.js';
import { InstallStore } from './install-store.js';
import { KeyValueStore } from './key-value-store.js';
import { PluginLoader } from './plugin-loader.js';
import type { PluginStatus } from './plugin-registry.js';

export const id = (s: string) => s as PluginID;
export const v = (s = '1.0.0') => s as SemVer;
export const mf = <X extends object = {}>(name: string, extra?: X) => ({
  id: id(name),
  name,
  version: v(),
  ...extra,
});

interface EchoShape {
  readonly shout: (s: string) => Effect.Effect<string>;
}
interface EchoFacade {
  readonly shout: (s: string) => string;
  readonly reset: () => void;
}
export const Echo = defineCapability<'echo', EchoShape, EchoFacade>('echo', (shape, ctx) => ({
  shout: s => ctx.runSync(shape.shout(s)),
  reset: () => {
    ctx.require('write');
    ctx.audit('reset');
  },
}));
export const EchoLive = Layer.succeed(Echo.tag, { shout: s => Effect.succeed(s.toUpperCase()) });

export type TestKernelConfig = Omit<
  Partial<KernelConfig<readonly [typeof Echo]>>,
  'capabilities' | 'capabilityLayer'
>;

export const makeKernel = (mods: Record<string, AnyPluginModule>, cfg: TestKernelConfig = {}) =>
  createKernel({
    capabilities: [Echo],
    capabilityLayer: EchoLive,
    loader: PluginLoader.fromMap(new Map(Object.entries(mods).map(([k, m]) => [id(k), m]))),
    store: InstallStore.memory(),
    ...cfg,
    supervision: { backoff: { initial: '1 millis', max: '5 millis' }, ...cfg.supervision },
  });

export type TestKernel = ReturnType<typeof makeKernel>;

export const statusOf = (k: TestKernel, name: string): PluginStatus | undefined =>
  k.view.snapshot().plugins.get(id(name))?.status;

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export const waitFor = async (pred: () => boolean, ms = 2000) => {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('waitFor timeout');
    await sleep(2);
  }
};

export const rejection = async (p: Promise<unknown>): Promise<any> => {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('expected rejection');
};

/** 可跨 kernel 实例共享的内存 KV（模拟 durable 存储） */
export const sharedKv = (m: Map<string, string>) =>
  Layer.succeed(
    KeyValueStore,
    KeyValueStore.of({
      get: k => Effect.sync(() => m.get(k)),
      set: (k, val) => Effect.sync(() => void m.set(k, val)),
      remove: k => Effect.sync(() => void m.delete(k)),
      keys: p => Effect.sync(() => [...m.keys()].filter(k => k.startsWith(p))),
    })
  );
