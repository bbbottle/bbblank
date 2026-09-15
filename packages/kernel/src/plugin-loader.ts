/**
 * PluginLoader —— 设计文档 §4.4（抽象服务，实现属于宿主）
 *
 * TODO：`Context.Service`；`load(id): Effect<PluginModule | EffectPluginModule, PluginLoadError>`；
 * 返回的 manifest 必须过 `Schema.decodeUnknownEffect(PluginManifest)` → `ManifestInvalid`。
 * 内核不提供默认实现（无 `import.meta.glob`、无 localStorage）。
 */
export {};
