/**
 * createKernel —— 设计文档 §6，宿主组装入口。
 * capabilityLayer 的输出必须覆盖 capabilities 中每个 def 的 Identifier，
 * 少给一个是编译错误——宿主与插件被同一套类型钳住。
 */
import { Effect, Layer, ManagedRuntime } from 'effect';
import type { AnyCapability, IdOf } from '@bbblank/sdk';
import { CapabilityBroker } from './capability-broker.js';
import { EventHubLive } from './event-hub.js';
import { InstallStore } from './install-store.js';
import { makeKernelView } from './kernel-view.js';
import { PermissionPolicy } from './permission-policy.js';
import { PluginLoader } from './plugin-loader.js';
import { PluginRegistry } from './plugin-registry.js';
import { ServiceRegistryLive } from './service-registry.js';

export interface KernelConfig<Caps extends ReadonlyArray<AnyCapability>> {
  readonly capabilities: Caps;
  /** 宿主实现，与 capabilities 一一对应 */
  readonly capabilityLayer: Layer.Layer<IdOf<Caps[number]>>;
  readonly loader: Layer.Layer<PluginLoader>;
  readonly store: Layer.Layer<InstallStore>;
  /** 缺省用内置宽松策略（guest 插件仍不能提供插件间服务） */
  readonly permission?: Layer.Layer<PermissionPolicy>;
  /** EventHub 的 payload Schema 校验，默认 true（prod 可关） */
  readonly dev?: boolean;
}

export const createKernel = <const Caps extends ReadonlyArray<AnyCapability>>(
  cfg: KernelConfig<Caps>
) => {
  const kernel = PluginRegistry.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(ServiceRegistryLive, EventHubLive({ validate: cfg.dev ?? true }))),
    Layer.provideMerge(CapabilityBroker.fromDefs(cfg.capabilities)),
    // CapabilityBroker 靠 `Effect.context<never>()` 抓能力实现，故 capabilityLayer 必须先并入
    Layer.provideMerge(cfg.capabilityLayer),
    Layer.provideMerge(
      Layer.mergeAll(cfg.loader, cfg.store, cfg.permission ?? PermissionPolicy.permissive)
    )
  );
  const runtime = ManagedRuntime.make(kernel);
  return {
    runtime,
    view: makeKernelView(runtime),
    bootstrap: () => runtime.runPromise(Effect.flatMap(PluginRegistry, r => r.bootstrap)),
    dispose: () => runtime.dispose(),
  };
};
