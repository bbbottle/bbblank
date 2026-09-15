/**
 * CapabilityBroker —— 设计文档 §4.2，内核与宿主的唯一接缝
 *
 * TODO：
 * - `class CapabilityBroker extends Context.Service<CapabilityBroker, CapabilityBrokerShape>()('@kernel/CapabilityBroker')`
 * - `has(id)` / `facadesFor(manifest, ctx)`（普通插件 `api.caps`）/ `contextFor(manifest)`（Effect 插件 Context 子集）
 * - `CapabilityBroker.fromDefs(defs)`：从宿主注入的 Capability Layer 中 `Context.getOption` 逐一取值
 */
export {};
