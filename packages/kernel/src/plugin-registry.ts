/**
 * PluginRegistry —— 设计文档 §4.5，内核核心
 *
 * TODO：`Context.Service`；状态放 `SubscriptionRef`（KernelView 订阅用）。
 * activate 流程：
 *   1. manifest 解码 → capability/dependency/perm 校验
 *   2. `Scope.fork` 出该插件独立 Scope
 *   3. plain 插件：`api = facades + services/events/lifecycle`，`setup(api)` 收 Cleanup
 *      effect 插件：`layer` 在插件 Scope 内 build
 *   4. 任一步失败 → `Scope.close` 回滚；成功才写 InstallStore
 * enable/disable/install/uninstall + Kahn 分层并行 bootstrap。
 */
export {};
