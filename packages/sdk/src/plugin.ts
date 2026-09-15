/**
 * 插件契约 —— 设计文档 §3.2 / §3.4
 * 普通插件：Promise + Cleanup 薄契约（作者不必学 Effect）。
 * Effect 插件：Layer 的 R 通道被 manifest 声明的能力集合封顶。
 */
import type { Layer, Scope } from 'effect';
import type {
  AnyCapability,
  CapabilityRecord,
  Cleanup,
  IdOf,
} from './capability.js';
import type { PluginSetupError } from './errors.js';
import type { KernelServices } from './kernel-services.js';
import type { PluginManifest } from './manifest.js';
import type { ServiceToken } from './service.js';
import type { Topic } from './topic.js';

export type { Cleanup } from './capability.js';

export interface PluginAPI<Caps extends ReadonlyArray<AnyCapability>> {
  readonly manifest: PluginManifest;
  readonly caps: CapabilityRecord<Caps>;
  readonly services: {
    register<T>(token: ServiceToken<T>, impl: T): Cleanup;
    get<T>(token: ServiceToken<T>): Promise<T>;
    tryGet<T>(token: ServiceToken<T>): T | undefined;
  };
  readonly events: {
    on<T>(topic: Topic<T>, cb: (payload: T) => void): Cleanup;
    emit<T>(topic: Topic<T>, payload: T): void;
  };
  readonly lifecycle: {
    addCleanup(c: Cleanup): void;
    onUninstallData(cb: () => void | Promise<void>): Cleanup;
  };
}

export interface PluginModule<
  Caps extends ReadonlyArray<AnyCapability> = ReadonlyArray<AnyCapability>,
> {
  readonly kind: 'plain';
  readonly manifest: Omit<PluginManifest, 'capabilities'>;
  readonly capabilities: Caps;
  readonly setup: (api: PluginAPI<Caps>) => void | Cleanup | Promise<void | Cleanup>;
  readonly onManualInstall?: (api: PluginAPI<Caps>) => void | Promise<void>;
}

export const definePlugin = <const Caps extends ReadonlyArray<AnyCapability>>(
  m: Omit<PluginModule<Caps>, 'kind'>
): PluginModule<Caps> => ({ kind: 'plain', ...m });

export interface EffectPluginModule<Caps extends ReadonlyArray<AnyCapability>, ROut> {
  readonly kind: 'effect';
  readonly manifest: Omit<PluginManifest, 'capabilities'>;
  readonly capabilities: Caps;
  /** R 只能是所声明 Capability 的 Identifier 与内核服务，超出即编译错误 */
  readonly layer: Layer.Layer<
    ROut,
    PluginSetupError,
    IdOf<Caps[number]> | KernelServices | Scope.Scope
  >;
}

export const defineEffectPlugin = <const Caps extends ReadonlyArray<AnyCapability>, ROut>(
  m: Omit<EffectPluginModule<Caps, ROut>, 'kind'>
): EffectPluginModule<Caps, ROut> => ({ kind: 'effect', ...m });

/**
 * 动态加载边界上的插件模块类型：Caps/ROut 在运行时不可知。
 * Caps 同时出现在协变与逆变位置（不变），故用 `any` 形参的版本表达"任意已定义插件"。
 */
export type AnyPluginModule =
  | PluginModule<any>
  | EffectPluginModule<any, any>;
