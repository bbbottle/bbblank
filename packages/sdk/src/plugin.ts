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
export {};
