/**
 * Capability 定义与推导 —— 设计文档 §2.2 / §2.3
 *
 * TODO：
 * - `CapabilityDef<Id, Shape, Facade>`：`{ id, tag: Context.Service<Id, Shape>, facade }`
 * - `FacadeContext`：`{ pluginId, scoped, run, runSync }`
 * - `defineCapability(id, facade)`
 * - 推导：`FacadeOf<C>` / `IdOf<C>` / `CapabilityRecord<Caps>`（mapped type + `as` 键重映射）
 */
export {};
