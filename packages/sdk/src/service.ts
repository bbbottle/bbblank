/**
 * 插件间服务 Token —— 设计文档 §3.3
 *
 * 同进程宿主，服务实现可含函数/类实例；`T` 只做编译期约束（幻影 invariant），不做运行时校验。
 *
 * TODO：
 * - `declare const ServiceTypeId: unique symbol`
 * - `ServiceToken<T> = { key: string; [ServiceTypeId]?: (_: T) => T }`
 * - `defineService<T>(key)`
 */
export {};
