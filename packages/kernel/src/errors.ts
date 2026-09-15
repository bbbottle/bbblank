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

import { Data } from "effect";

export class PluginNotFound extends Data.TaggedError("PluginNotFound")<{
  id: PluginID;
}> {}
export class PluginLoadError extends Data.TaggedError("PluginLoadError")<{
  id: PluginID;
  cause: unknown;
}> {}
export class ManifestInvalid extends Data.TaggedError("ManifestInvalid")<{
  id: string;
  issue: string;
}> {}
export class PluginSetupError extends Data.TaggedError("PluginSetupError")<{
  id: PluginID;
  cause: unknown;
}> {}
export class PermissionDenied extends Data.TaggedError("PermissionDenied")<{
  id: PluginID;
  required: PluginPerm;
}> {}
export class CapabilityMissing extends Data.TaggedError("CapabilityMissing")<{
  id: PluginID;
  capability: string;
}> {}
export class DependencyMissing extends Data.TaggedError("DependencyMissing")<{
  id: PluginID;
  missing: ReadonlyArray<PluginID>;
}> {}
export class DependencyCycle extends Data.TaggedError("DependencyCycle")<{
  cycle: ReadonlyArray<PluginID>;
}> {}
export class DependentsActive extends Data.TaggedError("DependentsActive")<{
  id: PluginID;
  dependents: ReadonlyArray<PluginID>;
}> {}

export type PluginError =
  | PluginNotFound
  | PluginLoadError
  | ManifestInvalid
  | PluginSetupError
  | PermissionDenied
  | CapabilityMissing
  | DependencyMissing
  | DependencyCycle
  | DependentsActive;
