/**
 * 类型基石与 Manifest —— 设计文档 §2.1 / §3.1
 *
 * TODO：
 * - `PluginID = Schema.String.pipe(Schema.brand('PluginID'))`
 * - `SemVer = Schema.String.pipe(Schema.check(Schema.isPattern(/^\d+\.\d+\.\d+/)), Schema.brand('SemVer'))`
 * - `PluginPerm = Schema.Literals(['guest', 'admin'])`
 * - `PluginManifest`：`Schema.Struct`（id / version / perm / dependencies / capabilities? ——
 *   capabilities 由 `capabilities` 元组推导，manifest 字段可用 `Omit` 掉）
 */
export {};
