/**
 * 事件 Topic —— 设计文档 §3.3
 *
 * payload 是数据，带 Schema：编译期类型与运行时校验共源（dev 下 `decodeUnknownSync`）。
 *
 * TODO：
 * - `Topic<T> = { key: string; schema: Schema.Codec<T> }`
 * - `defineTopic<S extends Schema.Top>(key, schema): Topic<S['Type']>`
 */
export {};
