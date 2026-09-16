/**
 * KernelView —— 设计文档 §5，内核对外的最小观察门面（不含 Effect 类型）。
 * `subscribe`/`snapshot` 恰好是 `useSyncExternalStore` 的签名，
 * 也适配 Lit `@lit/task`、Svelte store、纯 DOM 手动刷新。
 */
import { Effect, Fiber, ManagedRuntime, Stream, SubscriptionRef } from 'effect';
import type { PluginID } from '@bbblank/sdk';
import type { EventHub, ServiceRegistry } from '@bbblank/sdk';
import { PluginRegistry } from './plugin-registry.js';
import type { RegistrySnapshot } from './plugin-registry.js';
import type { CapabilityBroker } from './capability-broker.js';
import type { PermissionPolicy } from './permission-policy.js';
import type { PluginLoader } from './plugin-loader.js';
import type { InstallStore } from './install-store.js';

/** runtime 内的服务环境；ManagedRuntime 的 R 逆变，更大的 runtime 可赋给它 */
export type KernelEnv =
  | PluginRegistry
  | CapabilityBroker
  | ServiceRegistry
  | EventHub
  | PermissionPolicy
  | PluginLoader
  | InstallStore;

export interface KernelView {
  readonly snapshot: () => RegistrySnapshot;
  readonly subscribe: (cb: () => void) => () => void;
  readonly enable: (id: PluginID) => Promise<void>;
  readonly disable: (id: PluginID) => Promise<void>;
  readonly install: (id: PluginID) => Promise<void>;
  readonly uninstall: (id: PluginID) => Promise<void>;
}

export const makeKernelView = (
  rt: ManagedRuntime.ManagedRuntime<KernelEnv, never>
): KernelView => {
  const reg = rt.runSync(Effect.service(PluginRegistry));
  return {
    snapshot: () => rt.runSync(SubscriptionRef.get(reg.state)),
    subscribe: cb => {
      const fiber = rt.runFork(
        SubscriptionRef.changes(reg.state).pipe(Stream.runForEach(() => Effect.sync(cb)))
      );
      return () => {
        rt.runFork(Fiber.interrupt(fiber));
      };
    },
    enable: id => rt.runPromise(reg.enable(id)),
    disable: id => rt.runPromise(reg.disable(id)),
    install: id => rt.runPromise(reg.install(id, { manual: true })),
    uninstall: id => rt.runPromise(reg.uninstall(id)),
  };
};
