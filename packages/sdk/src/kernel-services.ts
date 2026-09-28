/**
 * 插件可依赖的内核服务 Tag —— 设计文档 §3.4 / §4.3
 * Tag/Shape 即契约（Effect 插件的 Layer R 通道可声明它们）；实现在 kernel。
 * kernel 内部服务（PermissionPolicy/InstallStore/PluginLoader/…）不在此列。
 */
import { Context } from 'effect';
import type { Effect, Stream } from 'effect';
import type { Cleanup } from './capability.js';
import type { EventPayloadInvalid } from './errors.js';
import type { PluginID } from './manifest.js';
import type { ServiceToken } from './service.js';
import type { Topic } from './topic.js';

export interface ServiceRegistryShape {
  /** 注册实现；返回的 Cleanup 同时被内核纳入插件 Scope 清理 */
  readonly register: <T>(
    token: ServiceToken<T>,
    impl: T,
    pluginId: PluginID
  ) => Effect.Effect<Cleanup>;
  /** 等待式 get：服务未注册时挂起直到有人注册 */
  readonly get: <T>(token: ServiceToken<T>) => Effect.Effect<T>;
  readonly tryGet: <T>(token: ServiceToken<T>) => Effect.Effect<T | undefined>;
  /** devtools 归属查询：该插件注册过的服务 key */
  readonly ownedBy: (pluginId: PluginID) => Effect.Effect<ReadonlyArray<string>>;
}

export class ServiceRegistry extends Context.Service<ServiceRegistry, ServiceRegistryShape>()(
  '@kernel/ServiceRegistry'
) {}

export interface EventHubShape {
  /** Schema 校验（缺省开启）失败即 EventPayloadInvalid；满载时按宿主配置的背压策略处理 */
  readonly publish: <T>(topic: Topic<T>, payload: T) => Effect.Effect<void, EventPayloadInvalid>;
  readonly subscribe: <T>(topic: Topic<T>) => Stream.Stream<T>;
}

export class EventHub extends Context.Service<EventHub, EventHubShape>()('@kernel/EventHub') {}

/** Effect 插件的 layer R 允许声明的内核服务 */
export type KernelServices = ServiceRegistry | EventHub;
