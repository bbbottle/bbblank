/**
 * 插件错误联合 —— 设计文档 §4.1
 * PluginSetupError 定义在 sdk（契约错误），此处 re-export 并纳入联合。
 */
<<<<<<< HEAD

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
=======
import { Data } from 'effect';
import { PluginSetupError } from '@bbblank/sdk';
import type { PluginID, PluginPerm } from '@bbblank/sdk';

export { PluginSetupError };

export class PluginNotFound extends Data.TaggedError('PluginNotFound')<{ id: PluginID }> {}
export class PluginLoadError extends Data.TaggedError('PluginLoadError')<{
  id: PluginID;
  cause: unknown;
}> {}
export class ManifestInvalid extends Data.TaggedError('ManifestInvalid')<{
  id: string;
  issue: string;
}> {}
export class PermissionDenied extends Data.TaggedError('PermissionDenied')<{
  id: PluginID;
  required: PluginPerm;
}> {}
export class CapabilityMissing extends Data.TaggedError('CapabilityMissing')<{
  id: PluginID;
  capability: string;
}> {}
export class DependencyMissing extends Data.TaggedError('DependencyMissing')<{
  id: PluginID;
  missing: ReadonlyArray<PluginID>;
}> {}
export class DependencyCycle extends Data.TaggedError('DependencyCycle')<{
  cycle: ReadonlyArray<PluginID>;
}> {}
export class DependentsActive extends Data.TaggedError('DependentsActive')<{
>>>>>>> 439e5ed0047a57aee2d667b2aed6184834693bcb
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
