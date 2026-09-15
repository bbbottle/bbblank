/**
 * EventHub —— 设计文档 §4.3
 *
 * TODO：`Context.Service` + `PubSub.unbounded`；`emit` 在 dev 下对 payload 做
 * `Schema.decodeUnknownSync(topic.schema)`；`on` 返回的订阅 Cleanup 挂到插件 Scope。
 */
export {};
