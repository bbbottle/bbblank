/**
 * createKernel —— 设计文档 §6，宿主组装入口。
 * capabilityLayer 的输出必须覆盖 capabilities 中每个 def 的 Identifier，
 * 少给一个是编译错误——宿主与插件被同一套类型钳住。
 */
import { Effect, Layer, ManagedRuntime } from 'effect';
import type { AnyCapability, IdOf } from '@bbblank/sdk';
import { AuditLog } from './audit-log.js';
import { CapabilityBroker } from './capability-broker.js';
import { EventBusLive, EventHubLive } from './event-hub.js';
import type { EventHubOptions } from './event-hub.js';
import type { InstallStore } from './install-store.js';
import { makeKernelView } from './kernel-view.js';
import { PermissionPolicy } from './permission-policy.js';
import type { PluginLoader } from './plugin-loader.js';
import { KernelOptions, PluginRegistry } from './plugin-registry.js';
import type { KernelTimeouts, SupervisionPolicy } from './plugin-registry.js';
import { ServiceRegistryLive } from './service-registry.js';

export interface KernelConfig<Caps extends ReadonlyArray<AnyCapability>> {
  readonly capabilities: Caps;
  /** 宿主实现，与 capabilities 一一对应 */
  readonly capabilityLayer: Layer.Layer<IdOf<Caps[number]>>;
  readonly loader: Layer.Layer<PluginLoader>;
  readonly store: Layer.Layer<InstallStore>;
  /** 缺省信任 manifest 申请（PermissionPolicy.permissive） */
  readonly permission?: Layer.Layer<PermissionPolicy>;
  /** §10.2 重启/熔断策略 */
  readonly supervision?: Partial<Omit<SupervisionPolicy, 'backoff'>> & {
    readonly backoff?: Partial<SupervisionPolicy['backoff']>;
  };
  /** §10.6 事件总线容量/背压策略/校验（校验缺省开启） */
  readonly events?: Partial<EventHubOptions>;
  readonly timeouts?: Partial<KernelTimeouts>;
  /** §10.5 缺省为内存环形缓冲 + 结构化日志 */
  readonly audit?: Layer.Layer<AuditLog>;
}

export const createKernel = <const Caps extends ReadonlyArray<AnyCapability>>(
  cfg: KernelConfig<Caps>
) => {
  const kernel = PluginRegistry.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(ServiceRegistryLive, EventHubLive)),
    Layer.provideMerge(EventBusLive(cfg.events)),
    Layer.provideMerge(CapabilityBroker.fromDefs(cfg.capabilities)),
    // CapabilityBroker 靠 `Effect.context<never>()` 抓能力实现，故 capabilityLayer 必须先并入
    Layer.provideMerge(cfg.capabilityLayer),
    Layer.provideMerge(
      Layer.mergeAll(
        cfg.loader,
        cfg.store,
        cfg.permission ?? PermissionPolicy.permissive,
        cfg.audit ?? AuditLog.memory(),
        KernelOptions.layer({
          ...(cfg.supervision ? { supervision: cfg.supervision } : {}),
          ...(cfg.timeouts ? { timeouts: cfg.timeouts } : {}),
        })
      )
    )
  );
  const runtime = ManagedRuntime.make(kernel);
  return {
    runtime,
    view: makeKernelView(runtime),
    /** 逐插件失败不 reject，返回 BootstrapReport（§10.1） */
    bootstrap: () => runtime.runPromise(Effect.flatMap(Effect.service(PluginRegistry), r => r.bootstrap)),
    /** 有序停机（reverse-Kahn）后释放 runtime */
    dispose: () => runtime.dispose(),
  };
};
