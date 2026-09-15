import { AnyCapability, CapabilityRecord, Cleanup } from "./capability.js";
import { PluginManifest } from "./manifest.js";
import { ServiceToken } from "./service.js";
import { Topic } from "./topic.js";
import { Layer } from "effect";

/**
 * 插件契约 —— 设计文档 §3.2 / §3.4
 *
 * TODO：
 * - `Cleanup = () => void | Promise<void>`
 * - `PluginAPI<Caps>`：`caps: CapabilityRecord<Caps>` + services / events / lifecycle 子面
 * - `PluginModule<Caps>`（`kind: 'plain'`）与 `definePlugin`（注意 `const Caps` 泛型推导元组）
 * - `EffectPluginModule<Caps, ROut>` 与 `defineEffectPlugin`：Layer 的 `R` 通道被
 *   `IdOf<Caps[number]> | KernelServices | Scope.Scope` 封顶
 */

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
  readonly kind: "plain";
  readonly manifest: Omit<PluginManifest, "capabilities">;
  readonly capabilities: Caps;
  readonly setup: (
    api: PluginAPI<Caps>,
  ) => void | Cleanup | Promise<void | Cleanup>;
  readonly onManualInstall?: (api: PluginAPI<Caps>) => void | Promise<void>;
}

export const definePlugin = <const Caps extends ReadonlyArray<AnyCapability>>(
  m: Omit<PluginModule<Caps>, "kind">,
): PluginModule<Caps> => ({ kind: "plain", ...m });

export interface EffectPluginModule<
  Caps extends ReadonlyArray<AnyCapability>,
  ROut,
> {
  readonly kind: "effect";
  readonly manifest: Omit<PluginManifest, "capabilities">;
  readonly capabilities: Caps;
  /** R 只能是所声明 Capability 的 Identifier 与内核服务，超出即编译错误 */
  readonly layer: Layer.Layer<
    ROut,
    PluginSetupError,
    IdOf<Caps[number]> | KernelServices | Scope.Scope
  >;
}

export const defineEffectPlugin = <
  const Caps extends ReadonlyArray<AnyCapability>,
  ROut,
>(
  m: Omit<EffectPluginModule<Caps, ROut>, "kind">,
): EffectPluginModule<Caps, ROut> => ({ kind: "effect", ...m });
