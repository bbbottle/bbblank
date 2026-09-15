/**
 * createKernel —— 设计文档 §6，宿主组装入口
 *
 * TODO：
 * - `KernelConfig<Caps>`：`capabilities`（元组）+ `capabilityLayer`（类型受 Caps 约束）+
 *   loader/store/permission Layer
 * - 用 `Layer.provideMerge` / `Layer.mergeAll` 组合内核服务与宿主能力
 * - 返回 `ManagedRuntime`（或包好的 `KernelView` + dispose）
 */
export {};
