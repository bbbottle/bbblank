/**
 * 插件契约 —— 设计文档 §3.2 / §3.4 / §10.7
 * 普通插件：Promise + Cleanup 薄契约（作者不必学 Effect）。
 * Effect 插件：Layer 的 R 通道被 manifest 声明的能力集合封顶。
 */
import type { Layer, Schema, Scope } from 'effect';
import type {
  AnyCapability,
  CapabilityRecord,
  Cleanup,
  IdOf,
} from './capability.js';
import type { PluginSetupError } from './errors.js';
import type { KernelServices } from './kernel-services.js';
import { SDK_VERSION } from './manifest.js';
import type { ManifestInput, PluginManifest, SemVer } from './manifest.js';
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
    on<T>(topic: Topic<T>, cb: (payload: T) => unknown): Cleanup;
    emit<T>(topic: Topic<T>, payload: T): void;
  };
  readonly lifecycle: {
    addCleanup(c: Cleanup): void;
    onUninstallData(cb: () => void | Promise<void>): Cleanup;
  };
}

type ManifestFor<Caps extends ReadonlyArray<AnyCapability>> = ManifestInput<IdOf<Caps[number]>>;

/** 配置（§10.7）：原始配置 = store 记录 > defaultConfig > {}，经 configSchema 解码 */
interface Configurable<C> {
  readonly configSchema?: Schema.Decoder<C>;
  /** 编码形态的缺省配置 */
  readonly defaultConfig?: unknown;
}

export interface PluginModule<
  Caps extends ReadonlyArray<AnyCapability> = ReadonlyArray<AnyCapability>,
  C = void,
> extends Configurable<C> {
  readonly kind: 'plain';
  readonly manifest: ManifestFor<Caps>;
  readonly capabilities: Caps;
  readonly setup: (api: PluginAPI<Caps>, config: C) => void | Cleanup | Promise<void | Cleanup>;
  readonly onManualInstall?: (api: PluginAPI<Caps>) => void | Promise<void>;
}

const stamp = <M extends { readonly manifest: object }>(m: M): M => ({
  ...m,
  manifest: { sdkVersion: SDK_VERSION as SemVer, ...m.manifest },
});

export const definePlugin = <const Caps extends ReadonlyArray<AnyCapability>, C = void>(
  m: Omit<PluginModule<Caps, C>, 'kind'>
): PluginModule<Caps, C> => stamp({ kind: 'plain', ...m });

export type PluginLayer<Caps extends ReadonlyArray<AnyCapability>, ROut> = Layer.Layer<
  ROut,
  PluginSetupError,
  IdOf<Caps[number]> | KernelServices | Scope.Scope
>;

export interface EffectPluginModule<Caps extends ReadonlyArray<AnyCapability>, ROut, C = void>
  extends Configurable<C> {
  readonly kind: 'effect';
  readonly manifest: ManifestFor<Caps>;
  readonly capabilities: Caps;
  /** R 只能是所声明 Capability 的 Identifier 与内核服务，超出即编译错误；需要配置时写成函数 */
  readonly layer: PluginLayer<Caps, ROut> | ((config: C) => PluginLayer<Caps, ROut>);
}

export const defineEffectPlugin = <
  const Caps extends ReadonlyArray<AnyCapability>,
  ROut,
  C = void,
>(
  m: Omit<EffectPluginModule<Caps, ROut, C>, 'kind'>
): EffectPluginModule<Caps, ROut, C> => stamp({ kind: 'effect', ...m });

/**
 * 动态加载边界上的插件模块类型：Caps/ROut/C 在运行时不可知。
 * Caps 同时出现在协变与逆变位置（不变），故用 `any` 形参的版本表达"任意已定义插件"。
 */
export type AnyPluginModule =
  | PluginModule<any, any>
  | EffectPluginModule<any, any, any>;
