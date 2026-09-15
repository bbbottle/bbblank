/**
 * ServiceRegistry —— 设计文档 §4.3
 *
 * TODO：`Context.Service` + `Ref`/`HashMap` 存放 `ServiceToken` 到实现的映射；
 * register 的 Cleanup 挂到调用插件的 Scope 上（插件卸载自动注销）。
 */
export {};
