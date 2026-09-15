/**
 * 插件错误联合 —— 设计文档 §4.1
 *
 * TODO：`Data.TaggedError` 各错误类 + `PluginError` 判别联合
 * （PluginNotFound / PluginLoadError / ManifestInvalid / PluginSetupError /
 *   PermissionDenied / CapabilityMissing / DependencyMissing /
 *   DependencyCycle / DependentsActive）
 *
 * 收益：宿主可用 `Effect.catchTags` 对联合穷举，漏分支编译报错。
 */
export {};
